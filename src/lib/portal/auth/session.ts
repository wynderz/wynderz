import { createHash, randomBytes } from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb, type Tx } from "../db";
import { sessions, users } from "../db/schema";

export const PORTAL_COOKIE = "wz_portal_session";
const IDLE_MS = 12 * 60 * 60 * 1000; // 12h sliding
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max
const TOUCH_AFTER_MS = 10 * 60 * 1000;

export type PortalUser = { id: number; name: string; email: string };
export type PortalSession = { sessionId: string; user: PortalUser };

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").trim();
}

export async function createSession(db: Tx, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const now = Date.now();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(now + IDLE_MS),
    ip: await clientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) || null,
  });
  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now)));
  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ABSOLUTE_MS / 1000),
  });
}

/** Validates the cookie against the database. Cached per request. */
export const getPortalSession = cache(async (): Promise<PortalSession | null> => {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = getDb();
  const id = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), eq(users.isActive, true)))
    .limit(1);
  if (!row) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    const absoluteEnd = row.createdAt.getTime() + ABSOLUTE_MS;
    const nextExpiry = new Date(Math.min(now.getTime() + IDLE_MS, absoluteEnd));
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: nextExpiry }).where(eq(sessions.id, id));
  }
  return { sessionId: row.sessionId, user: { id: row.userId, name: row.name, email: row.email } };
});

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.set(PORTAL_COOKIE, "", { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/", maxAge: 0 });
}

export { revokeUserSessions } from "./revoke";
