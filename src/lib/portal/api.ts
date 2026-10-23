import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import type { Ctx } from "./audit";
import { getPortalSession, clientIp, type PortalSession } from "./auth/session";
import { getDb, type Db } from "./db";
import { AppError, fromPgError, unauthorized } from "./errors";

type RouteContext<P> = { params: Promise<P> };

type HandlerArgs<P> = {
  req: NextRequest;
  params: P;
  db: Db;
  ctx: Ctx;
  session: PortalSession;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Wraps every /api/portal handler:
 *  - server-side session validation against Postgres
 *  - same-origin check for state-changing requests (CSRF defence, on top of SameSite cookies)
 *  - consistent JSON errors (validation, constraint violations, generic 500 without leaking internals)
 */
export function route<P = Record<string, string>>(
  handler: (args: HandlerArgs<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: RouteContext<P>) => {
    try {
      if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
        throw new AppError("Cross-site request blocked.", 403, "csrf");
      }
      const session = await getPortalSession();
      if (!session) throw unauthorized();
      const ctx: Ctx = { userId: session.user.id, userEmail: session.user.email, ip: await clientIp() };
      const params = (await context.params) ?? ({} as P);
      const result = await handler({ req, params, db: getDb(), ctx, session });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    const first = Object.entries(fields)[0];
    return NextResponse.json(
      { error: first ? `${humanize(first[0])}: ${first[1]}` : "Invalid input.", code: "validation", fields },
      { status: 400 },
    );
  }
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status });
  }
  const pg = fromPgError(err);
  if (pg) return NextResponse.json({ error: pg.message, code: pg.code }, { status: pg.status });
  console.error("[portal] unhandled error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again.", code: "server_error" }, { status: 500 });
}

export function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON.");
  }
}

/** URLSearchParams -> plain object for zod parsing. */
export function queryObject(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export function parseId(value: string | undefined) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError("Invalid id.", 400);
  return n;
}

function humanize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
