import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { ctx, freshDb, hasDb } from "./helpers";
import { createYear } from "@/lib/portal/services/financial-years";
import { createInvoice, createReceipt, listInvoices, setReceivableArchived, updateInvoice } from "@/lib/portal/services/receivables";
import { financeTotals } from "@/lib/portal/queries/finance";

/** A cancelled/archived invoice never has active receipts, so Received and Receivables stay consistent. */
describe.skipIf(!hasDb)("receipts on cancelled invoices", () => {
  let db: Db;
  let pool: Pool;
  let fy: number;
  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    fy = (await createYear(db, ctx, { label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31" })).id;
  });
  afterAll(async () => pool?.end());

  const base = { invoiceDate: "2025-06-01", baseAmount: "1000", gstRate: "0" };

  it("blocks cancelling or archiving an invoice that has active receipts", async () => {
    const inv = await createInvoice(db, ctx, { ...base, invoiceNumber: "R-1" });
    const rec = await createReceipt(db, ctx, { invoiceId: inv.id, receiptDate: "2025-06-10", amount: "400" });
    await expect(updateInvoice(db, ctx, inv.id, { ...base, invoiceNumber: "R-1", status: "cancelled" })).rejects.toThrow(/receipt\(s\) totalling ₹400\.00/);
    await expect(setReceivableArchived(db, ctx, "invoice", inv.id, true)).rejects.toMatchObject({ status: 409 });

    // Refund path: archive the receipt, then cancelling is allowed and the receipt can't be restored onto it.
    await setReceivableArchived(db, ctx, "receipt", rec.id, true);
    await updateInvoice(db, ctx, inv.id, { ...base, invoiceNumber: "R-1", status: "cancelled" });
    await expect(setReceivableArchived(db, ctx, "receipt", rec.id, false)).rejects.toThrow(/cancelled or archived/);
    await expect(createReceipt(db, ctx, { invoiceId: inv.id, receiptDate: "2025-06-11", amount: "1" })).rejects.toThrow(/cancelled or archived/);

    const t = await financeTotals(db, { fy });
    expect(t).toMatchObject({ invoiced: "0.00", received: "0.00", receivables: "0.00" });
  });

  it("keeps dashboard and invoice-list figures in agreement", async () => {
    const inv = await createInvoice(db, ctx, { ...base, invoiceNumber: "R-2" });
    await createReceipt(db, ctx, { invoiceId: inv.id, receiptDate: "2025-06-10", amount: "250" });
    const t = await financeTotals(db, { fy });
    const list = await listInvoices(db, { fy });
    expect(t).toMatchObject({ invoiced: "1000.00", received: "250.00", receivables: "750.00" });
    expect(list.summary).toMatchObject({ invoiced: "1000.00", received: "250.00" });
  });
});
