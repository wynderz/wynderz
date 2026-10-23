import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { categories, expenses, financialYears, materials, projects, suppliers } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { compareMoney, computeTax, derivePaymentStatus, normalizeMoney } from "../money";
import {
  correction,
  id as idSchema,
  isoDate,
  listQuery,
  optDate,
  optId,
  optMoney,
  optQty,
  optText,
  percent,
  reqText,
} from "../validation";
import { EXPENSE_KINDS } from "./categories";
import { archivedFilter, correctionNote, countAll, dateRange, offset, orderBy, pageOf, search, writableYearFor } from "./shared";

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"] as const;

export const expenseInput = z
  .object({
    expenseDate: isoDate,
    projectId: optId,
    categoryId: idSchema,
    supplierId: optId,
    payeeName: optText(200),
    description: reqText(500),
    quantity: optQty,
    unitPrice: optMoney,
    baseAmount: optMoney,
    gstRate: percent,
    amountPaid: optMoney,
    paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
    paymentMethod: optText(40),
    paidBy: optText(120),
    paymentDate: optDate,
    paymentReference: optText(120),
    billNumber: optText(120),
    billStatus: z.enum(["pending", "received", "not_applicable"]).default("pending"),
    notes: optText(4000),
    ...correction,
  })
  .refine((v) => v.baseAmount !== null || (v.quantity !== null && v.unitPrice !== null), {
    message: "Enter a base amount, or a quantity and unit price",
    path: ["baseAmount"],
  });

export type ExpenseInput = z.infer<typeof expenseInput>;

export const expenseListQuery = listQuery.extend({
  projectId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  kind: z.enum(EXPENSE_KINDS).optional(),
  scope: z.enum(["project", "general"]).optional(),
  source: z.enum(["manual", "material"]).optional(),
});

/** Amounts + payment status, all computed on the server. */
export function computeExpenseMoney(input: Pick<ExpenseInput, "baseAmount" | "quantity" | "unitPrice" | "gstRate" | "amountPaid" | "paymentStatus">) {
  const tax = computeTax({
    baseAmount: input.baseAmount,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    gstRate: input.gstRate,
  });
  let amountPaid: string;
  if (input.amountPaid !== null && input.amountPaid !== undefined) {
    amountPaid = normalizeMoney(input.amountPaid);
  } else if (input.paymentStatus === "paid") {
    amountPaid = tax.totalAmount;
  } else if (input.paymentStatus === "partial") {
    throw new AppError("Enter the amount paid for a partial payment.", 400, "validation", { field: "amountPaid" });
  } else {
    amountPaid = "0.00";
  }
  if (compareMoney(amountPaid, tax.totalAmount) > 0) {
    throw new AppError("Amount paid cannot exceed the total amount.", 400, "validation", { field: "amountPaid" });
  }
  return { ...tax, amountPaid, paymentStatus: derivePaymentStatus(tax.totalAmount, amountPaid) };
}

async function validateRefs(db: Tx, input: { categoryId: number; projectId: number | null; supplierId: number | null }, categoryType: "expense" | "material" = "expense") {
  const [cat] = await db.select().from(categories).where(eq(categories.id, input.categoryId));
  if (!cat || cat.type !== categoryType) throw new AppError("Choose a valid category.", 400, "validation", { field: "categoryId" });
  if (input.projectId) {
    const [p] = await db.select({ archivedAt: projects.archivedAt }).from(projects).where(eq(projects.id, input.projectId));
    if (!p) throw new AppError("Choose a valid project.", 400, "validation", { field: "projectId" });
    if (p.archivedAt) throw new AppError("This project is archived. Restore it before adding records.", 400);
  }
  if (input.supplierId) {
    const [s] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.supplierId));
    if (!s) throw new AppError("Choose a valid supplier.", 400, "validation", { field: "supplierId" });
  }
  return cat;
}

export { validateRefs };

const linkedMaterial = alias(materials, "linked_material");

export function expenseWhere(q: z.infer<typeof expenseListQuery>) {
  return and(
    q.fy ? eq(expenses.financialYearId, q.fy) : undefined,
    q.projectId ? eq(expenses.projectId, q.projectId) : undefined,
    q.scope === "project" ? sql`${expenses.projectId} is not null` : undefined,
    q.scope === "general" ? sql`${expenses.projectId} is null` : undefined,
    q.categoryId ? eq(expenses.categoryId, q.categoryId) : undefined,
    q.supplierId ? eq(expenses.supplierId, q.supplierId) : undefined,
    q.paymentStatus ? eq(expenses.paymentStatus, q.paymentStatus) : undefined,
    q.kind ? eq(categories.kind, q.kind) : undefined,
    q.source ? eq(expenses.source, q.source) : undefined,
    dateRange(expenses.expenseDate, q.from, q.to),
    archivedFilter(expenses.archivedAt, q.archived),
    search(q.q, [expenses.description, expenses.billNumber, expenses.payeeName, expenses.paymentReference, suppliers.name, projects.name, projects.code]),
  );
}

const listColumns = {
  id: expenses.id,
  expenseDate: expenses.expenseDate,
  description: expenses.description,
  categoryId: expenses.categoryId,
  categoryName: categories.name,
  categoryKind: categories.kind,
  projectId: expenses.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  supplierId: expenses.supplierId,
  supplierName: suppliers.name,
  payeeName: expenses.payeeName,
  quantity: expenses.quantity,
  unitPrice: expenses.unitPrice,
  baseAmount: expenses.baseAmount,
  gstRate: expenses.gstRate,
  gstAmount: expenses.gstAmount,
  totalAmount: expenses.totalAmount,
  amountPaid: expenses.amountPaid,
  paymentStatus: expenses.paymentStatus,
  paymentMethod: expenses.paymentMethod,
  paidBy: expenses.paidBy,
  paymentDate: expenses.paymentDate,
  paymentReference: expenses.paymentReference,
  billNumber: expenses.billNumber,
  billStatus: expenses.billStatus,
  notes: expenses.notes,
  source: expenses.source,
  materialId: linkedMaterial.id,
  financialYearId: expenses.financialYearId,
  yearLabel: financialYears.label,
  archivedAt: expenses.archivedAt,
};

function baseSelect(db: Tx) {
  return db
    .select(listColumns)
    .from(expenses)
    .innerJoin(categories, eq(categories.id, expenses.categoryId))
    .innerJoin(financialYears, eq(financialYears.id, expenses.financialYearId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
    .leftJoin(linkedMaterial, eq(linkedMaterial.expenseId, expenses.id));
}

export async function listExpenses(db: Db, raw: unknown) {
  const q = expenseListQuery.parse(raw);
  const where = expenseWhere(q);
  const sortable = {
    date: expenses.expenseDate,
    total: expenses.totalAmount,
    category: categories.name,
    supplier: suppliers.name,
    project: projects.code,
    status: expenses.paymentStatus,
  };
  const [rows, [summary]] = await Promise.all([
    baseSelect(db)
      .where(where)
      .orderBy(...orderBy(sortable, q, [desc(expenses.expenseDate), desc(expenses.id)]))
      .limit(q.pageSize)
      .offset(offset(q)),
    db
      .select({
        total: countAll,
        sumTotal: sql<string>`coalesce(sum(${expenses.totalAmount}), 0)`,
        sumPaid: sql<string>`coalesce(sum(${expenses.amountPaid}), 0)`,
        sumGst: sql<string>`coalesce(sum(${expenses.gstAmount}), 0)`,
      })
      .from(expenses)
      .innerJoin(categories, eq(categories.id, expenses.categoryId))
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
      .where(where),
  ]);
  return { ...pageOf(rows, summary.total, q), summary };
}

export async function exportExpenses(db: Db, raw: unknown) {
  const q = expenseListQuery.parse({ ...(raw as object), page: 1, pageSize: 200 });
  return baseSelect(db).where(expenseWhere(q)).orderBy(desc(expenses.expenseDate), desc(expenses.id)).limit(50_000);
}

export async function getExpense(db: Tx, id: number) {
  const [row] = await baseSelect(db).where(eq(expenses.id, id));
  if (!row) throw notFound("Expense");
  return row;
}

export async function createExpense(db: Db, ctx: Ctx, raw: unknown) {
  const input = expenseInput.parse(raw);
  return db.transaction(async (tx) => {
    await validateRefs(tx, input);
    const { fy, isCorrection } = await writableYearFor(tx, input.expenseDate, input.correctionReason);
    const amounts = computeExpenseMoney(input);
    const { correctionReason, ...data } = input;
    const [row] = await tx
      .insert(expenses)
      .values({ ...data, ...amounts, financialYearId: fy.id, source: "manual", createdBy: ctx.userId })
      .returning();
    await audit(tx, ctx, {
      action: "create",
      entity: "expense",
      entityId: row.id,
      summary: `Expense ₹${row.totalAmount} · ${row.description}${correctionNote(isCorrection, correctionReason)}`,
    });
    return row;
  });
}

async function loadEditable(tx: Tx, id: number) {
  const [before] = await tx.select().from(expenses).where(eq(expenses.id, id));
  if (!before) throw notFound("Expense");
  if (before.source === "material") {
    throw conflict("This expense was created from a material purchase. Edit it from Materials & Spares so both stay in sync.");
  }
  return before;
}

export async function updateExpense(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = expenseInput.parse(raw);
  return db.transaction(async (tx) => {
    const before = await loadEditable(tx, id);
    if (before.archivedAt) throw conflict("Restore this expense before editing it.");
    // Both the original and the new year must accept changes.
    const prev = await writableYearFor(tx, before.expenseDate, input.correctionReason);
    const next = await writableYearFor(tx, input.expenseDate, input.correctionReason);
    await validateRefs(tx, input);
    const amounts = computeExpenseMoney(input);
    const { correctionReason, ...data } = input;
    const [row] = await tx
      .update(expenses)
      .set({ ...data, ...amounts, financialYearId: next.fy.id, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    await audit(tx, ctx, {
      action: "update",
      entity: "expense",
      entityId: id,
      summary: `Updated expense #${id}${correctionNote(prev.isCorrection || next.isCorrection, correctionReason)}`,
      changes: diff(before, row),
    });
    return row;
  });
}

export async function setExpenseArchived(db: Db, ctx: Ctx, id: number, archived: boolean, correctionReason?: string | null) {
  return db.transaction(async (tx) => {
    const before = await loadEditable(tx, id);
    const { isCorrection } = await writableYearFor(tx, before.expenseDate, correctionReason);
    const [row] = await tx
      .update(expenses)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    await audit(tx, ctx, {
      action: archived ? "archive" : "restore",
      entity: "expense",
      entityId: id,
      summary: `${archived ? "Archived" : "Restored"} expense #${id} (₹${before.totalAmount})${correctionNote(isCorrection, correctionReason)}`,
    });
    return row;
  });
}
