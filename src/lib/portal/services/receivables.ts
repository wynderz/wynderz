import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { financialYears, invoices, projects, receipts } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { compareMoney, computeTax, normalizeMoney, subMoney } from "../money";
import { correction, isoDate, listQuery, money, optDate, optId, optText, percent, reqText } from "../validation";
import { archivedFilter, correctionNote, countAll, dateRange, offset, pageOf, search, writableYearFor } from "./shared";

/* Invoices = amounts billed to customers. Receipts = money actually received.
   Contract value on a project is neither, and is never reported as revenue collected. */

export const invoiceInput = z.object({
  projectId: optId,
  invoiceNumber: reqText(60),
  invoiceDate: isoDate,
  dueDate: optDate,
  customer: optText(200),
  baseAmount: money,
  gstRate: percent,
  status: z.enum(["draft", "issued", "cancelled"]).default("issued"),
  notes: optText(2000),
  ...correction,
});

export const receiptInput = z.object({
  projectId: optId,
  invoiceId: optId,
  receiptDate: isoDate,
  amount: money.refine((v) => Number(v) > 0, "Must be greater than zero"),
  paymentMethod: optText(40),
  reference: optText(120),
  notes: optText(2000),
  ...correction,
});

export const receivableListQuery = listQuery.extend({ projectId: z.coerce.number().int().positive().optional() });

const receivedFor = sql<string>`(select coalesce(sum(r.amount),0) from receipts r where r.invoice_id = invoices.id and r.archived_at is null)`;

/** Invoice status follows receipts automatically unless cancelled/draft. */
async function refreshInvoiceStatus(tx: Tx, invoiceId: number) {
  const [inv] = await tx.select({ total: invoices.totalAmount, status: invoices.status, received: receivedFor }).from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.status === "cancelled" || inv.status === "draft") return;
  const status = compareMoney(inv.received, inv.total) >= 0 ? "paid" : compareMoney(inv.received, "0") > 0 ? "partially_paid" : "issued";
  if (status !== inv.status) await tx.update(invoices).set({ status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
}

/**
 * Invariant: a cancelled or archived invoice has no active receipts. Collected cash always counts as
 * "Received", so it must not hang off an invoice that no longer counts as "Invoiced" (receivables would
 * be understated). Refunds/credits are recorded by archiving the receipt first.
 */
async function assertNoActiveReceipts(tx: Tx, invoiceId: number, action: string) {
  const [r] = await tx
    .select({ count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${receipts.amount}),0)` })
    .from(receipts)
    .where(and(eq(receipts.invoiceId, invoiceId), isNull(receipts.archivedAt)));
  if (r.count > 0) {
    throw conflict(`Cannot ${action} this invoice: it has ${r.count} receipt(s) totalling ₹${normalizeMoney(r.amount)}. Archive those receipts first (e.g. after a refund).`);
  }
}

async function assertProject(tx: Tx, projectId: number | null) {
  if (!projectId) return null;
  const [p] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!p) throw new AppError("Choose a valid project.");
  return p;
}

export async function listInvoices(db: Db, raw: unknown) {
  const q = receivableListQuery.parse(raw);
  const where = and(
    q.fy ? eq(invoices.financialYearId, q.fy) : undefined,
    q.projectId ? eq(invoices.projectId, q.projectId) : undefined,
    dateRange(invoices.invoiceDate, q.from, q.to),
    archivedFilter(invoices.archivedAt, q.archived),
    search(q.q, [invoices.invoiceNumber, invoices.customer, projects.name, projects.code]),
  );
  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        customer: invoices.customer,
        projectId: invoices.projectId,
        projectCode: projects.code,
        projectName: projects.name,
        baseAmount: invoices.baseAmount,
        gstRate: invoices.gstRate,
        gstAmount: invoices.gstAmount,
        totalAmount: invoices.totalAmount,
        received: receivedFor,
        status: invoices.status,
        notes: invoices.notes,
        yearLabel: financialYears.label,
        archivedAt: invoices.archivedAt,
      })
      .from(invoices)
      .innerJoin(financialYears, eq(financialYears.id, invoices.financialYearId))
      .leftJoin(projects, eq(projects.id, invoices.projectId))
      .where(where)
      .orderBy(desc(invoices.invoiceDate), desc(invoices.id))
      .limit(q.pageSize)
      .offset(offset(q)),
    db
      .select({
        total: countAll,
        invoiced: sql<string>`coalesce(sum(case when ${invoices.status} <> 'cancelled' then ${invoices.totalAmount} end),0)`,
        received: sql<string>`coalesce(sum(case when ${invoices.status} <> 'cancelled' then ${receivedFor} end),0)`,
      })
      .from(invoices)
      .leftJoin(projects, eq(projects.id, invoices.projectId))
      .where(where),
  ]);
  return {
    ...pageOf(rows.map((r) => ({ ...r, received: normalizeMoney(r.received), outstanding: r.status === "cancelled" ? "0.00" : subMoney(r.totalAmount, r.received) })), summary.total, q),
    summary: { ...summary, outstanding: subMoney(summary.invoiced, summary.received) },
  };
}

export async function listReceipts(db: Db, raw: unknown) {
  const q = receivableListQuery.parse(raw);
  const where = and(
    q.fy ? eq(receipts.financialYearId, q.fy) : undefined,
    q.projectId ? eq(receipts.projectId, q.projectId) : undefined,
    dateRange(receipts.receiptDate, q.from, q.to),
    archivedFilter(receipts.archivedAt, q.archived),
    search(q.q, [receipts.reference, receipts.notes, projects.name, projects.code, invoices.invoiceNumber]),
  );
  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: receipts.id,
        receiptDate: receipts.receiptDate,
        amount: receipts.amount,
        paymentMethod: receipts.paymentMethod,
        reference: receipts.reference,
        notes: receipts.notes,
        projectId: receipts.projectId,
        projectCode: projects.code,
        projectName: projects.name,
        invoiceId: receipts.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        yearLabel: financialYears.label,
        archivedAt: receipts.archivedAt,
      })
      .from(receipts)
      .innerJoin(financialYears, eq(financialYears.id, receipts.financialYearId))
      .leftJoin(projects, eq(projects.id, receipts.projectId))
      .leftJoin(invoices, eq(invoices.id, receipts.invoiceId))
      .where(where)
      .orderBy(desc(receipts.receiptDate), desc(receipts.id))
      .limit(q.pageSize)
      .offset(offset(q)),
    db
      .select({ total: countAll, amount: sql<string>`coalesce(sum(${receipts.amount}),0)` })
      .from(receipts)
      .leftJoin(projects, eq(projects.id, receipts.projectId))
      .leftJoin(invoices, eq(invoices.id, receipts.invoiceId))
      .where(where),
  ]);
  return { ...pageOf(rows, summary.total, q), summary };
}

export async function invoiceOptions(db: Tx, projectId?: number) {
  return db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, totalAmount: invoices.totalAmount, projectId: invoices.projectId })
    .from(invoices)
    .where(and(isNull(invoices.archivedAt), sql`${invoices.status} <> 'cancelled'`, projectId ? eq(invoices.projectId, projectId) : undefined))
    .orderBy(desc(invoices.invoiceDate));
}

export async function createInvoice(db: Db, ctx: Ctx, raw: unknown) {
  const input = invoiceInput.parse(raw);
  return db.transaction(async (tx) => {
    const project = await assertProject(tx, input.projectId);
    const { fy, isCorrection } = await writableYearFor(tx, input.invoiceDate, input.correctionReason);
    const tax = computeTax({ baseAmount: input.baseAmount, gstRate: input.gstRate });
    const { correctionReason, ...data } = input;
    const [row] = await tx
      .insert(invoices)
      .values({ ...data, ...tax, customer: data.customer ?? project?.customer ?? null, financialYearId: fy.id })
      .returning();
    await audit(tx, ctx, { action: "create", entity: "invoice", entityId: row.id, summary: `Invoice ${row.invoiceNumber} ₹${row.totalAmount}${correctionNote(isCorrection, correctionReason)}` });
    return row;
  });
}

export async function updateInvoice(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = invoiceInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(invoices).where(eq(invoices.id, id));
    if (!before) throw notFound("Invoice");
    if (input.status === "cancelled" && before.status !== "cancelled") await assertNoActiveReceipts(tx, id, "cancel");
    const prev = await writableYearFor(tx, before.invoiceDate, input.correctionReason);
    const next = await writableYearFor(tx, input.invoiceDate, input.correctionReason);
    await assertProject(tx, input.projectId);
    const tax = computeTax({ baseAmount: input.baseAmount, gstRate: input.gstRate });
    const { correctionReason, ...data } = input;
    const [row] = await tx.update(invoices).set({ ...data, ...tax, financialYearId: next.fy.id, updatedAt: new Date() }).where(eq(invoices.id, id)).returning();
    await refreshInvoiceStatus(tx, id);
    await audit(tx, ctx, { action: "update", entity: "invoice", entityId: id, summary: `Updated invoice ${row.invoiceNumber}${correctionNote(prev.isCorrection || next.isCorrection, correctionReason)}`, changes: diff(before, row) });
    return row;
  });
}

export async function createReceipt(db: Db, ctx: Ctx, raw: unknown) {
  const input = receiptInput.parse(raw);
  return db.transaction(async (tx) => {
    let projectId = input.projectId;
    if (input.invoiceId) {
      const [inv] = await tx.select({ id: invoices.id, projectId: invoices.projectId, status: invoices.status, archivedAt: invoices.archivedAt }).from(invoices).where(eq(invoices.id, input.invoiceId));
      if (!inv) throw new AppError("Choose a valid invoice.");
      if (inv.status === "cancelled" || inv.archivedAt) throw conflict("Cannot record a receipt against a cancelled or archived invoice.");
      if (projectId && inv.projectId && projectId !== inv.projectId) throw new AppError("The invoice belongs to a different project.");
      projectId = projectId ?? inv.projectId;
    }
    await assertProject(tx, projectId);
    const { fy, isCorrection } = await writableYearFor(tx, input.receiptDate, input.correctionReason);
    const { correctionReason, ...data } = input;
    const [row] = await tx.insert(receipts).values({ ...data, projectId, financialYearId: fy.id }).returning();
    if (row.invoiceId) await refreshInvoiceStatus(tx, row.invoiceId);
    await audit(tx, ctx, { action: "create", entity: "receipt", entityId: row.id, summary: `Receipt ₹${row.amount}${correctionNote(isCorrection, correctionReason)}` });
    return row;
  });
}

export async function setReceivableArchived(db: Db, ctx: Ctx, kind: "invoice" | "receipt", id: number, archived: boolean, correctionReason?: string | null) {
  return db.transaction(async (tx) => {
    if (kind === "invoice") {
      const [before] = await tx.select().from(invoices).where(eq(invoices.id, id));
      if (!before) throw notFound("Invoice");
      const { isCorrection } = await writableYearFor(tx, before.invoiceDate, correctionReason);
      if (archived && !before.archivedAt) await assertNoActiveReceipts(tx, id, "archive");
      await tx.update(invoices).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(invoices.id, id));
      await audit(tx, ctx, { action: archived ? "archive" : "restore", entity: "invoice", entityId: id, summary: `${archived ? "Archived" : "Restored"} invoice ${before.invoiceNumber}${correctionNote(isCorrection, correctionReason)}` });
    } else {
      const [before] = await tx.select().from(receipts).where(eq(receipts.id, id));
      if (!before) throw notFound("Receipt");
      const { isCorrection } = await writableYearFor(tx, before.receiptDate, correctionReason);
      if (!archived && before.archivedAt && before.invoiceId) {
        const [inv] = await tx.select({ status: invoices.status, archivedAt: invoices.archivedAt }).from(invoices).where(eq(invoices.id, before.invoiceId));
        if (inv?.status === "cancelled" || inv?.archivedAt) throw conflict("Cannot restore a receipt whose invoice is cancelled or archived.");
      }
      await tx.update(receipts).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(receipts.id, id));
      if (before.invoiceId) await refreshInvoiceStatus(tx, before.invoiceId);
      await audit(tx, ctx, { action: archived ? "archive" : "restore", entity: "receipt", entityId: id, summary: `${archived ? "Archived" : "Restored"} receipt ₹${before.amount}${correctionNote(isCorrection, correctionReason)}` });
    }
  });
}
