import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { expenses, materials, suppliers } from "../db/schema";
import { notFound } from "../errors";
import { subMoney } from "../money";
import { listQuery, optText, reqText } from "../validation";
import { countAll, offset, orderBy, pageOf, search } from "./shared";

const GSTIN = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/;

export const supplierInput = z.object({
  code: optText(30),
  name: reqText(200),
  category: optText(80),
  contactPerson: optText(120),
  phone: optText(40),
  email: optText(200).refine((v) => v === null || z.string().email().safeParse(v).success, "Invalid email"),
  gstin: optText(15)
    .transform((v) => (v ? v.toUpperCase() : v))
    .refine((v) => v === null || GSTIN.test(v), "GSTIN must be 15 characters (e.g. 36ABCDE1234F1Z5)"),
  address: optText(500),
  city: optText(80),
  notes: optText(2000),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const supplierListQuery = listQuery.extend({ status: z.enum(["active", "inactive"]).optional() });

async function nextCode(db: Tx) {
  const res = await db.execute<{ n: number }>(
    sql`select coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) + 1 as n from suppliers where code ~ '^V-\\d+$'`,
  );
  return `V-${String(res.rows[0]?.n ?? 1).padStart(3, "0")}`;
}

export async function listSuppliers(db: Db, raw: unknown) {
  const q = supplierListQuery.parse(raw);
  const where = and(
    search(q.q, [suppliers.name, suppliers.code, suppliers.category, suppliers.city, suppliers.gstin, suppliers.contactPerson]),
    q.status ? eq(suppliers.status, q.status) : undefined,
  );
  // Spend comes from expenses only (materials are represented by their linked expense).
  const spend = db
    .select({ supplierId: expenses.supplierId, total: sql<string>`sum(${expenses.totalAmount})`.as("total") })
    .from(expenses)
    .where(and(sql`${expenses.archivedAt} is null`, q.fy ? eq(expenses.financialYearId, q.fy) : undefined))
    .groupBy(expenses.supplierId)
    .as("spend");
  const sortable = { name: suppliers.name, code: suppliers.code, city: suppliers.city, spend: sql`coalesce(${spend.total}, 0)` };
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        code: suppliers.code,
        name: suppliers.name,
        category: suppliers.category,
        contactPerson: suppliers.contactPerson,
        phone: suppliers.phone,
        email: suppliers.email,
        gstin: suppliers.gstin,
        city: suppliers.city,
        address: suppliers.address,
        notes: suppliers.notes,
        status: suppliers.status,
        totalSpend: sql<string>`coalesce(${spend.total}, 0)`,
      })
      .from(suppliers)
      .leftJoin(spend, eq(spend.supplierId, suppliers.id))
      .where(where)
      .orderBy(...orderBy(sortable, q, [asc(suppliers.name)]))
      .limit(q.pageSize)
      .offset(offset(q)),
    db.select({ total: countAll }).from(suppliers).where(where),
  ]);
  return pageOf(rows, total, q);
}

export async function supplierOptions(db: Tx) {
  return db
    .select({ id: suppliers.id, name: suppliers.name, status: suppliers.status })
    .from(suppliers)
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(db: Db, id: number) {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!row) throw notFound("Supplier");
  const [totals] = await db
    .select({
      total: sql<string>`coalesce(sum(${expenses.totalAmount}), 0)`,
      paid: sql<string>`coalesce(sum(${expenses.amountPaid}), 0)`,
      count: countAll,
    })
    .from(expenses)
    .where(and(eq(expenses.supplierId, id), sql`${expenses.archivedAt} is null`));
  const recent = await db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      description: expenses.description,
      totalAmount: expenses.totalAmount,
      paymentStatus: expenses.paymentStatus,
    })
    .from(expenses)
    .where(and(eq(expenses.supplierId, id), sql`${expenses.archivedAt} is null`))
    .orderBy(desc(expenses.expenseDate))
    .limit(10);
  const [{ materialCount }] = await db
    .select({ materialCount: countAll })
    .from(materials)
    .where(eq(materials.supplierId, id));
  return { ...row, totals: { ...totals, outstanding: subMoney(totals.total, totals.paid) }, recent, materialCount };
}

export async function createSupplier(db: Db, ctx: Ctx, raw: unknown) {
  const input = supplierInput.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242002)`);
    const code = input.code || (await nextCode(tx));
    const [row] = await tx.insert(suppliers).values({ ...input, code }).returning();
    await audit(tx, ctx, { action: "create", entity: "supplier", entityId: row.id, summary: `Created supplier ${row.name}` });
    return row;
  });
}

export async function updateSupplier(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = supplierInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(suppliers).where(eq(suppliers.id, id));
    if (!before) throw notFound("Supplier");
    const [row] = await tx
      .update(suppliers)
      .set({ ...input, code: input.code || before.code, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    await audit(tx, ctx, { action: "update", entity: "supplier", entityId: id, summary: `Updated supplier ${row.name}`, changes: diff(before, row) });
    return row;
  });
}
