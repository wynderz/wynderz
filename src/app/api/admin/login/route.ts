import { NextResponse } from "next/server";
import { getAdminIdentity, verifyAdminPassword } from "@/lib/admin/password";
import { clearLoginAttempts, loginAllowed } from "@/lib/admin/rate-limit";
import { setAdminSessionCookie } from "@/lib/admin/session";
import { timingSafeEqualString } from "@/lib/admin/session-token";

export const runtime = "nodejs";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const identity = getAdminIdentity();
  const secret = (process.env.AUTH_SECRET || process.env.ADMIN_SESSION_SECRET || "").trim();
  const hasHash = Boolean(process.env.ADMIN_PASSWORD_HASH?.trim());
  const hasPlain = Boolean(process.env.ADMIN_PASSWORD);

  if (!identity || (!hasHash && !hasPlain) || secret.length < 32) {
    return NextResponse.json(
      {
        error:
          "Admin login is not configured. Set ADMIN_EMAIL (or ADMIN_USERNAME), ADMIN_PASSWORD_HASH, and AUTH_SECRET.",
      },
      { status: 503 },
    );
  }

  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const ip = clientIp(request);
  const limit = loginAllowed(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait and try again." },
      { status: 429 },
    );
  }

  let body: { username?: string; email?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  const submittedUser = String(body.email || body.username || "");
  const submittedPass = String(body.password || "");
  const userOk = timingSafeEqualString(submittedUser.toLowerCase(), identity.toLowerCase());
  const passOk = verifyAdminPassword(submittedPass);

  if (!userOk || !passOk) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  clearLoginAttempts(ip);
  await setAdminSessionCookie(identity);
  return NextResponse.json({ ok: true });
}
