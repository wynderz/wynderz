import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type Ctx } from "../audit";
import { getDummyHash, hashPassword, validatePasswordStrength, verifyPassword } from "../auth/password";
import { checkLoginAllowed, recordLoginAttempt } from "../auth/rate-limit";
import { revokeUserSessions } from "../auth/revoke";
import type { Db, Tx } from "../db";
import { auditLogs, users } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { listQuery, reqText } from "../validation";
import { countAll, offset, pageOf, search } from "./shared";

/** Every active account is a full Admin. No roles, no employee logins, no public registration. */

const email = z.string().trim().toLowerCase().email("Enter a valid email").max(200);
const password = z.string().superRefine((v, ctx) => {
  const err = validatePasswordStrength(v);
  if (err) ctx.addIssue({ code: "custom", message: err });
});

export const createUserInput = z.object({ name: reqText(120), email, password });
export const updateUserInput = z.object({ name: reqText(120), email });
export const changePasswordInput = z.object({ currentPassword: z.string().min(1, "Required"), newPassword: password });
export const resetPasswordInput = z.object({ newPassword: password });

const publicCols = {
  id: users.id,
  name: users.name,
  email: users.email,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export async function listUsers(db: Db) {
  return db.select(publicCols).from(users).orderBy(desc(users.isActive), asc(users.name));
}

async function activeCount(tx: Tx, excludeId?: number) {
  const [r] = await tx
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.isActive, true), excludeId ? ne(users.id, excludeId) : undefined));
  return r.n;
}

/**
 * Login: generic error message, constant-ish timing, DB-backed rate limit.
 * Returns the user on success.
 */
export async function authenticate(db: Db, ip: string, rawEmail: string, pass: string) {
  const parsedEmail = email.safeParse(rawEmail);
  const em = parsedEmail.success ? parsedEmail.data : String(rawEmail).trim().toLowerCase().slice(0, 200);
  if (!(await checkLoginAllowed(db, ip, em))) {
    throw new AppError("Too many sign-in attempts. Please wait 15 minutes and try again.", 429, "rate_limited");
  }
  const [user] = parsedEmail.success
    ? await db.select().from(users).where(sql`lower(${users.email}) = ${em}`).limit(1)
    : [];
  const ok = user ? await verifyPassword(user.passwordHash, pass) : (await verifyPassword(await getDummyHash(), pass), false);
  if (!user || !ok || !user.isActive) {
    await recordLoginAttempt(db, ip, em, false);
    if (user && ok && !user.isActive) {
      await audit(db, { userId: user.id, userEmail: user.email, ip }, { action: "login_denied", entity: "user", entityId: user.id, summary: "Sign-in attempt on a deactivated account" });
    }
    throw new AppError("Incorrect email or password.", 401, "invalid_credentials");
  }
  await recordLoginAttempt(db, ip, em, true);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit(db, { userId: user.id, userEmail: user.email, ip }, { action: "login", entity: "user", entityId: user.id, summary: "Signed in" });
  return { id: user.id, name: user.name, email: user.email };
}

export async function createUser(db: Db, ctx: Ctx, raw: unknown) {
  const input = createUserInput.parse(raw);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(users).values({ name: input.name, email: input.email, passwordHash }).returning(publicCols);
    await audit(tx, ctx, { action: "create", entity: "user", entityId: row.id, summary: `Created admin ${row.email}` });
    return row;
  });
}

export async function updateUser(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = updateUserInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select(publicCols).from(users).where(eq(users.id, id));
    if (!before) throw notFound("Admin");
    const [row] = await tx.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, id)).returning(publicCols);
    await audit(tx, ctx, { action: "update", entity: "user", entityId: id, summary: `Updated admin ${before.email}${before.email !== row.email ? ` → ${row.email}` : ""}` });
    return row;
  });
}

/** Deactivation keeps history; the last active admin can never be deactivated. */
export async function setUserActive(db: Db, ctx: Ctx, id: number, isActive: boolean) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242010)`);
    const [before] = await tx.select(publicCols).from(users).where(eq(users.id, id));
    if (!before) throw notFound("Admin");
    if (!isActive && before.isActive && (await activeCount(tx, id)) === 0) {
      throw conflict("You cannot deactivate the last active admin.");
    }
    const [row] = await tx.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id)).returning(publicCols);
    if (!isActive) await revokeUserSessions(tx, id);
    await audit(tx, ctx, { action: isActive ? "activate" : "deactivate", entity: "user", entityId: id, summary: `${isActive ? "Activated" : "Deactivated"} admin ${row.email}` });
    return row;
  });
}

/** Hard delete is only allowed for accounts that never acted (no audit history) and never the last admin. */
export async function deleteUser(db: Db, ctx: Ctx, id: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242010)`);
    const [before] = await tx.select(publicCols).from(users).where(eq(users.id, id));
    if (!before) throw notFound("Admin");
    if (id === ctx.userId) throw conflict("You cannot delete your own account.");
    if (before.isActive && (await activeCount(tx, id)) === 0) throw conflict("You cannot delete the last active admin.");
    const [{ n }] = await tx.select({ n: countAll }).from(auditLogs).where(and(eq(auditLogs.userId, id), ne(auditLogs.action, "login")));
    if (n > 0) throw conflict("This admin has activity history. Deactivate the account instead.");
    await tx.delete(users).where(eq(users.id, id));
    await audit(tx, ctx, { action: "delete", entity: "user", entityId: id, summary: `Deleted admin ${before.email}` });
  });
}

export async function changeOwnPassword(db: Db, ctx: Ctx, raw: unknown, keepSessionId: string) {
  const input = changePasswordInput.parse(raw);
  const [user] = await db.select().from(users).where(eq(users.id, ctx.userId!));
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError("Your current password is incorrect.", 400, "validation", { field: "currentPassword" });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    // Sign out every other session.
    await tx.execute(sql`delete from sessions where user_id = ${user.id} and id <> ${keepSessionId}`);
    await audit(tx, ctx, { action: "change_password", entity: "user", entityId: user.id, summary: "Changed own password" });
  });
}

/** Another admin sets a new password (e.g. forgotten password). All of that user's sessions end. */
export async function resetUserPassword(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = resetPasswordInput.parse(raw);
  const passwordHash = await hashPassword(input.newPassword);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id)).returning(publicCols);
    if (!row) throw notFound("Admin");
    await revokeUserSessions(tx, id);
    await audit(tx, ctx, { action: "reset_password", entity: "user", entityId: id, summary: `Reset password for ${row.email}` });
  });
}

/* ------------------------------------------------------------------ audit log */

export const auditQuery = listQuery.extend({
  entity: z.string().max(40).optional(),
  action: z.string().max(40).optional(),
  userId: z.coerce.number().int().positive().optional(),
});

export async function listAudit(db: Db, raw: unknown) {
  const q = auditQuery.parse(raw);
  const where = and(
    q.entity ? eq(auditLogs.entity, q.entity) : undefined,
    q.action ? eq(auditLogs.action, q.action) : undefined,
    q.userId ? eq(auditLogs.userId, q.userId) : undefined,
    q.from ? sql`${auditLogs.createdAt} >= ${q.from}::date` : undefined,
    q.to ? sql`${auditLogs.createdAt} < (${q.to}::date + 1)` : undefined,
    search(q.q, [auditLogs.summary, auditLogs.userEmail, auditLogs.entityId]),
  );
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(q.pageSize).offset(offset(q)),
    db.select({ total: countAll }).from(auditLogs).where(where),
  ]);
  return pageOf(rows, total, q);
}

export async function auditFacets(db: Db) {
  const [entities, actions] = await Promise.all([
    db.selectDistinct({ v: auditLogs.entity }).from(auditLogs).orderBy(auditLogs.entity),
    db.selectDistinct({ v: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
  ]);
  return { entities: entities.map((e) => e.v), actions: actions.map((a) => a.v) };
}
