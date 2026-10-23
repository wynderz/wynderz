import type { Tx } from "./db";
import { auditLogs } from "./db/schema";

/** Who is acting. Services receive this from the API layer (or tests/scripts). */
export type Ctx = { userId: number | null; userEmail: string | null; ip: string | null };

export const systemCtx: Ctx = { userId: null, userEmail: "system", ip: null };

const SKIP_KEYS = new Set(["updatedAt", "createdAt", "passwordHash"]);

/** Field-level diff of two plain rows, ignoring timestamps and secrets. */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (SKIP_KEYS.has(key)) continue;
    const a = before?.[key] ?? null;
    const b = after?.[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { from: a, to: b };
  }
  return changes;
}

export async function audit(
  db: Tx,
  ctx: Ctx,
  entry: {
    action: string;
    entity: string;
    entityId?: string | number | null;
    summary?: string;
    changes?: unknown;
  },
) {
  await db.insert(auditLogs).values({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    ip: ctx.ip,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    summary: entry.summary?.slice(0, 500) ?? null,
    changes: entry.changes ?? null,
  });
}
