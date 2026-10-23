import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/portal/audit";
import { errorResponse, isSameOrigin } from "@/lib/portal/api";
import { clientIp, destroyCurrentSession, getPortalSession } from "@/lib/portal/auth/session";
import { getDb } from "@/lib/portal/db";
import { AppError } from "@/lib/portal/errors";

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new AppError("Cross-site request blocked.", 403, "csrf");
    const session = await getPortalSession();
    if (session) {
      await audit(getDb(), { userId: session.user.id, userEmail: session.user.email, ip: await clientIp() }, { action: "logout", entity: "user", entityId: session.user.id, summary: "Signed out" });
    }
    await destroyCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
