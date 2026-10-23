import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { categories, expenses, financialYears, materials, projects, suppliers } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { compareMoney, computeTax, derivePaymentStatus, normalizeMoney } from "../money";
import { correction, id as idSchema, listQuery, optDate, optId, optMoney, optText, money, reqText, percent } from "../validation";
import { getMaterialsExpenseCategory } from "./categories";
import { validateRefs } from "./expenses";
import { archivedFilter, assertYearWritable, correctionNote, countAll, dateRange, getYear, offset, orderBy, pageOf, search, writableYearFor } from "./shared";

export const MATERIAL_STATUSES = ["planned", "ordered", "received"] as const;

export const materialInput = z
  .object({
    projectId: optId,
    categoryId: idSchema,
    supplierId: optId,
    itemName: reqText(200),
    specification: optText(1000),
    makeModel: optText(200),
    quantity: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).replace(/,/g, "").trim())
      .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v) && Number(v) > 0, "Must be a positive number"),
    unit: optText(30),
    unitCost: money,
    gstRate: percent,
    status: z.enum(MATERIAL_STATUSES).default("received"),
    financialYearId: optId,
    purchaseDate: optDate,
    purchaseReference: optText(120),
    amountPaid: optMoney,
    paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
    paymentMethod: optText(40),
    paidBy: optText(120),
    notes: optText(4000),
    ...correction,
  })
  .refine((v) => v.status === "planned" || !!v.purchaseDate, {
    message: "Purchase date is required once an item is ordered or received",
    path: ["purchaseDate"],
  })
  .refine((v) => !!v.purchaseDate || !!v.financialYearId, {
    message: "Choose a financial year for planned items without a purchase date",
    path: ["financialYearId"],
  });

export const materialListQuery = listQuery.extend({
  projectId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  status: z.enum(MATERIAL_STATUSES).optional(),
});

function computeMaterialMoney(input: z.infer<typeof materialInput>) {
  const tax = computeTax({ quantity: input.quantity, unitPrice: input.unitCost, gstRate: input.gstRate });
  let amountPaid = "0.00";
  if (input.status !== "planned") {
    if (input.amountPaid !== null) amountPaid = normalizeMoney(input.amountPaid);
    else if (input.paymentStatus === "paid") amountPaid = tax.totalAmount;
    else if (input.paymentStatus === "partial") throw new AppError("Enter the amount paid for a partial payment.");
  }
  if (compareMoney(amountPaid, tax.totalAmount) > 0) throw new AppError("Amount paid cannot exceed the total amount.");
  return { ...tax, amountPaid, paymentStatus: derivePaymentStatus(tax.totalAmount, amountPaid) };
}

async function resolveMaterialYear(tx: Tx, input: z.infer<typeof materialInput>) {
  if (input.purchaseDate) return writableYearFor(tx, input.purchaseDate, input.correctionReason);
  const fy = await getYear(tx, input.financialYearId!);
  return { fy, isCorrection: assertYearWritable(fy, input.correctionReason) };
}

/**
 * Keeps the single linked expense in sync with the material.
 * planned -> no expense; ordered/received -> exactly one expense (source = 'material').
 */
async function syncLinkedExpense(
  tx: Tx,
  ctx: Ctx,
  material: typeof materials.$inferSelect,
  extra: { paymentMethod: string | null; paidBy: string | null },
) {
  if (material.status === "planned" || material.archivedAt) {
    if (material.expenseId) {
      const expenseId = material.expenseId;
      await tx.update(materials).set({ expenseId: null }).where(eq(materials.id, material.id));
      if (material.archivedAt) {
        await tx.update(expenses).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(expenses.id, expenseId));
      } else {
        await tx.delete(expenses).where(eq(expenses.id, expenseId));
      }
      return null;
    }
    return null;
  }
  const cat = await getMaterialsExpenseCategory(tx);
  const desc = [material.itemName, material.specification, material.makeModel].filter(Boolean).join(" · ").slice(0, 500);
  const values = {
    financialYearId: material.financialYearId,
    expenseDate: material.purchaseDate!,
    projectId: material.projectId,
    categoryId: cat.id,
    supplierId: material.supplierId,
    description: desc,
    quantity: material.quantity,
    unitPrice: material.unitCost,
    baseAmount: material.baseAmount,
    gstRate: material.gstRate,
    gstAmount: material.gstAmount,
    totalAmount: material.totalAmount,
    amountPaid: material.amountPaid,
    paymentStatus: material.paymentStatus,
    paymentMethod: extra.paymentMethod,
    paidBy: extra.paidBy,
    billNumber: material.purchaseReference,
    billStatus: material.purchaseReference ? ("received" as const) : ("pending" as const),
    source: "material" as const,
    archivedAt: null,
    updatedAt: new Date(),
  };
  if (material.expenseId) {
    await tx.update(expenses).set(values).where(eq(expenses.id, material.expenseId));
    return material.expenseId;
  }
  const [exp] = await tx.insert(expenses).values({ ...values, createdBy: ctx.userId }).returning({ id: expenses.id });
  await tx.update(materials).set({ expenseId: exp.id }).where(eq(materials.id, material.id));
  return exp.id;
}

export async function createMaterial(db: Db, ctx: Ctx, raw: unknown) {
  const input = materialInput.parse(raw);
  return db.transaction(async (tx) => {
    await validateRefs(tx, input, "material");
    const { fy, isCorrection } = await resolveMaterialYear(tx, input);
    const amounts = computeMaterialMoney(input);
    const { correctionReason, paymentMethod, paidBy, financialYearId: _ignored, ...data } = input;
    void _ignored;
    const [row] = await tx.insert(materials).values({ ...data, ...amounts, financialYearId: fy.id }).returning();
    const expenseId = await syncLinkedExpense(tx, ctx, row, { paymentMethod, paidBy });
    await audit(tx, ctx, {
      action: "create",
      entity: "material",
      entityId: row.id,
      summary: `Material ${row.itemName} ×${row.quantity} ₹${row.totalAmount} (${row.status})${expenseId ? ` → expense #${expenseId}` : ""}${correctionNote(isCorrection, correctionReason)}`,
    });
    return { ...row, expenseId };
  });
}

export async function updateMaterial(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = materialInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(materials).where(eq(materials.id, id));
    if (!before) throw notFound("Material");
    if (before.archivedAt) throw conflict("Restore this item before editing it.");
    const beforeFy = await getYear(tx, before.financialYearId);
    const prevCorrection = assertYearWritable(beforeFy, input.correctionReason);
    await validateRefs(tx, input, "material");
    const { fy, isCorrection } = await resolveMaterialYear(tx, input);
    const amounts = computeMaterialMoney(input);
    const { correctionReason, paymentMethod, paidBy, financialYearId: _ignored, ...data } = input;
    void _ignored;
    const [row] = await tx
      .update(materials)
      .set({ ...data, ...amounts, financialYearId: fy.id, updatedAt: new Date() })
      .where(eq(materials.id, id))
      .returning();
    const expenseId = await syncLinkedExpense(tx, ctx, row, { paymentMethod, paidBy });
    await audit(tx, ctx, {
      action: "update",
      entity: "material",
      entityId: id,
      summary: `Updated material ${row.itemName}${correctionNote(prevCorrection || isCorrection, correctionReason)}`,
      changes: diff(before, { ...row, expenseId }),
    });
    return { ...row, expenseId };
  });
}

export async function setMaterialArchived(db: Db, ctx: Ctx, id: number, archived: boolean, correctionReason?: string | null) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(materials).where(eq(materials.id, id));
    if (!before) throw notFound("Material");
    const fy = await getYear(tx, before.financialYearId);
    const isCorrection = assertYearWritable(fy, correctionReason);
    const [row] = await tx
      .update(materials)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(materials.id, id))
      .returning();
    if (archived && row.expenseId) {
      await tx.update(expenses).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(expenses.id, row.expenseId));
    } else if (!archived && row.expenseId) {
      await tx.update(expenses).set({ archivedAt: null, updatedAt: new Date() }).where(eq(expenses.id, row.expenseId));
    }
    await audit(tx, ctx, {
      action: archived ? "archive" : "restore",
      entity: "material",
      entityId: id,
      summary: `${archived ? "Archived" : "Restored"} material ${before.itemName}${correctionNote(isCorrection, correctionReason)}`,
    });
    return row;
  });
}

function materialWhere(q: z.infer<typeof materialListQuery>) {
  return and(
    q.fy ? eq(materials.financialYearId, q.fy) : undefined,
    q.projectId ? eq(materials.projectId, q.projectId) : undefined,
    q.categoryId ? eq(materials.categoryId, q.categoryId) : undefined,
    q.supplierId ? eq(materials.supplierId, q.supplierId) : undefined,
    q.status ? eq(materials.status, q.status) : undefined,
    dateRange(materials.purchaseDate, q.from, q.to),
    archivedFilter(materials.archivedAt, q.archived),
    search(q.q, [materials.itemName, materials.specification, materials.makeModel, materials.purchaseReference, suppliers.name, projects.code, projects.name]),
  );
}

const materialColumns = {
  id: materials.id,
  itemName: materials.itemName,
  specification: materials.specification,
  makeModel: materials.makeModel,
  categoryId: materials.categoryId,
  categoryName: categories.name,
  projectId: materials.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  supplierId: materials.supplierId,
  supplierName: suppliers.name,
  quantity: materials.quantity,
  unit: materials.unit,
  unitCost: materials.unitCost,
  gstRate: materials.gstRate,
  baseAmount: materials.baseAmount,
  gstAmount: materials.gstAmount,
  totalAmount: materials.totalAmount,
  status: materials.status,
  purchaseDate: materials.purchaseDate,
  purchaseReference: materials.purchaseReference,
  amountPaid: materials.amountPaid,
  paymentStatus: materials.paymentStatus,
  paymentMethod: expenses.paymentMethod,
  paidBy: expenses.paidBy,
  expenseId: materials.expenseId,
  financialYearId: materials.financialYearId,
  yearLabel: financialYears.label,
  notes: materials.notes,
  archivedAt: materials.archivedAt,
};

function materialSelect(db: Tx) {
  return db
    .select(materialColumns)
    .from(materials)
    .innerJoin(categories, eq(categories.id, materials.categoryId))
    .innerJoin(financialYears, eq(financialYears.id, materials.financialYearId))
    .leftJoin(projects, eq(projects.id, materials.projectId))
    .leftJoin(suppliers, eq(suppliers.id, materials.supplierId))
    .leftJoin(expenses, eq(expenses.id, materials.expenseId));
}

export async function listMaterials(db: Db, raw: unknown) {
  const q = materialListQuery.parse(raw);
  const where = materialWhere(q);
  const sortable = { item: materials.itemName, date: materials.purchaseDate, total: materials.totalAmount, status: materials.status, category: categories.name };
  const [rows, [summary]] = await Promise.all([
    materialSelect(db).where(where).orderBy(...orderBy(sortable, q, [desc(materials.purchaseDate), desc(materials.id)])).limit(q.pageSize).offset(offset(q)),
    db
      .select({
        total: countAll,
        purchased: sql<string>`coalesce(sum(case when ${materials.status} <> 'planned' then ${materials.totalAmount} end), 0)`,
        planned: sql<string>`coalesce(sum(case when ${materials.status} = 'planned' then ${materials.totalAmount} end), 0)`,
      })
      .from(materials)
      .leftJoin(projects, eq(projects.id, materials.projectId))
      .leftJoin(suppliers, eq(suppliers.id, materials.supplierId))
      .where(where),
  ]);
  return { ...pageOf(rows, summary.total, q), summary };
}

export async function exportMaterials(db: Db, raw: unknown) {
  const q = materialListQuery.parse({ ...(raw as object), page: 1, pageSize: 200 });
  return materialSelect(db).where(materialWhere(q)).orderBy(desc(materials.purchaseDate)).limit(50_000);
}

export async function getMaterial(db: Tx, id: number) {
  const [row] = await materialSelect(db).where(eq(materials.id, id));
  if (!row) throw notFound("Material");
  return row;
}

export async function materialCategoryTotals(db: Db, fy?: number, projectId?: number) {
  return db
    .select({ category: categories.name, total: sql<string>`sum(${materials.totalAmount})`, items: countAll })
    .from(materials)
    .innerJoin(categories, eq(categories.id, materials.categoryId))
    .where(and(isNull(materials.archivedAt), sql`${materials.status} <> 'planned'`, fy ? eq(materials.financialYearId, fy) : undefined, projectId ? eq(materials.projectId, projectId) : undefined))
    .groupBy(categories.name)
    .orderBy(desc(sql`sum(${materials.totalAmount})`));
}
