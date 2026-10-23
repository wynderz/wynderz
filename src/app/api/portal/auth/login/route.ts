import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, isSameOrigin } from "@/lib/portal/api";
import { clientIp, createSession } from "@/lib/portal/auth/session";
import { getDb } from "@/lib/portal/db";
import { AppError } from "@/lib/portal/errors";
import { authenticate } from "@/lib/portal/services/users";

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new AppError("Cross-site request blocked.", 403, "csrf");
    const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    if (!email || !password) throw new AppError("Enter your email and password.");
    const db = getDb();
    const user = await authenticate(db, await clientIp(), email, password);
    await createSession(db, user.id);
    return NextResponse.json({ ok: true, user: { name: user.name } });
  } catch (err) {
    return errorResponse(err);
  }
}
