import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/portal/cron";
import { getDb } from "@/lib/portal/db";

export const dynamic = "force-dynamic";

/**
 * Daily keep-alive (vercel.json → crons). Free-plan Supabase projects pause after ~7 days without
 * database activity; one tiny query a day keeps the portal's database awake. Writes nothing.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron] keepalive failed", err);
    return NextResponse.json({ ok: false, error: "Database unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
