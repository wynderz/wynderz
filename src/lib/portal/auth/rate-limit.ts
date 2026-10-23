import { and, count, eq, gt, lt, or } from "drizzle-orm";
import type { Tx } from "../db";
import { loginAttempts } from "../db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 8;

/** DB-backed so limits hold across serverless instances. */
export async function checkLoginAllowed(db: Tx, ip: string, email: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byIp] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  const [byEmail] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  return byIp.n < MAX_PER_IP && byEmail.n < MAX_PER_EMAIL;
}

export async function recordLoginAttempt(db: Tx, ip: string, email: string, success: boolean) {
  await db.insert(loginAttempts).values({ ip, email, success });
  if (success) {
    // A successful login clears that account's failed attempts.
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false)));
  }
  await db
    .delete(loginAttempts)
    .where(or(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
}
