import { eq } from "drizzle-orm";
import type { Tx } from "../db";
import { sessions } from "../db/schema";

/** Ends every session of a user (deactivation, password reset). Free of Next.js imports. */
export async function revokeUserSessions(db: Tx, userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
