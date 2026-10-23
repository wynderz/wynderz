import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { categories } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { reqText } from "../validation";

export const EXPENSE_KINDS = ["project", "office", "travel", "machine", "purchase", "materials", "other"] as const;

export const categoryInput = z.object({
  type: z.enum(["expense", "material"]),
  name: reqText(80),
  kind: z.enum(EXPENSE_KINDS).default("other"),
  isActive: z.boolean().default(true),
});

/** The expense category that represents purchased materials in financial totals. */
export const MATERIALS_EXPENSE_CATEGORY = "Materials & Spares";

export async function listCategories(db: Tx, type?: "expense" | "material", activeOnly = false) {
  return db
    .select()
    .from(categories)
    .where(and(type ? eq(categories.type, type) : undefined, activeOnly ? eq(categories.isActive, true) : undefined))
    .orderBy(asc(categories.type), asc(categories.name));
}

export async function getMaterialsExpenseCategory(db: Tx) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.type, "expense"), eq(categories.isSystem, true), eq(categories.kind, "materials")))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(categories)
    .values({ type: "expense", name: MATERIALS_EXPENSE_CATEGORY, kind: "materials", isSystem: true })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.type, "expense"), sql`lower(${categories.name}) = lower(${MATERIALS_EXPENSE_CATEGORY})`));
  return existing;
}

export async function createCategory(db: Db, ctx: Ctx, raw: unknown) {
  const input = categoryInput.parse(raw);
  const kind = input.type === "material" ? "materials" : input.kind;
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(categories).values({ ...input, kind }).returning();
    await audit(tx, ctx, { action: "create", entity: "category", entityId: row.id, summary: `Created ${row.type} category ${row.name}` });
    return row;
  });
}

export async function updateCategory(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = categoryInput.partial().parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!before) throw notFound("Category");
    if (before.isSystem && (input.kind && input.kind !== before.kind || input.type && input.type !== before.type || input.isActive === false)) {
      throw new AppError("System categories can be renamed but not deactivated or re-typed.");
    }
    const [row] = await tx
      .update(categories)
      .set({ ...input, type: before.type, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    await audit(tx, ctx, { action: "update", entity: "category", entityId: id, summary: `Updated category ${row.name}`, changes: diff(before, row) });
    return row;
  });
}

export async function deleteCategory(db: Db, ctx: Ctx, id: number) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!before) throw notFound("Category");
    if (before.isSystem) throw conflict("System categories cannot be deleted.");
    await tx.delete(categories).where(eq(categories.id, id)); // FK restrict -> friendly 409 if in use
    await audit(tx, ctx, { action: "delete", entity: "category", entityId: id, summary: `Deleted category ${before.name}` });
  });
}
