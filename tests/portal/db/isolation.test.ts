import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { categoryId, ctx, freshDb, hasDb } from "./helpers";
import { createYear } from "@/lib/portal/services/financial-years";
import { createProject, getProjectDashboard, listProjects } from "@/lib/portal/services/projects";
import { createExpense } from "@/lib/portal/services/expenses";
import { createMaterial } from "@/lib/portal/services/materials";
import { createInvoice, createReceipt, listInvoices } from "@/lib/portal/services/receivables";

/** Regression: per-project / per-invoice figures must not leak between records (ids deliberately misaligned). */
describe.skipIf(!hasDb)("per-record isolation of computed figures", () => {
  let db: Db;
  let pool: Pool;
  beforeAll(async () => ({ db, pool } = await freshDb()));
  afterAll(async () => pool?.end());

  it("project and invoice totals only include their own records", async () => {
    const fy = (await createYear(db, ctx, { label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31" })).id;
    const travel = await categoryId(db, "expense", "Travel & Stay");
    const bearings = await categoryId(db, "material", "Bearings");
    const a = await createProject(db, ctx, { name: "A", financialYearId: fy });
    const b = await createProject(db, ctx, { name: "B", financialYearId: fy });
    const c = await createProject(db, ctx, { name: "C", financialYearId: fy });
    // Misalign expense ids from project ids.
    for (let i = 0; i < 5; i++) await createExpense(db, ctx, { expenseDate: "2025-05-01", categoryId: travel, description: `office ${i}`, baseAmount: "1" });
    await createExpense(db, ctx, { expenseDate: "2025-05-02", projectId: b.id, categoryId: travel, description: "B trip", baseAmount: "1000", amountPaid: "250" });
    await createMaterial(db, ctx, { projectId: b.id, categoryId: bearings, itemName: "Bearing", quantity: "2", unitCost: "500", status: "received", purchaseDate: "2025-05-03" });
    await createExpense(db, ctx, { expenseDate: "2025-05-04", projectId: c.id, categoryId: travel, description: "C trip", baseAmount: "7" });

    const ib = await createInvoice(db, ctx, { projectId: b.id, invoiceNumber: "B-1", invoiceDate: "2025-06-01", baseAmount: "5000" });
    const ia = await createInvoice(db, ctx, { projectId: a.id, invoiceNumber: "A-1", invoiceDate: "2025-06-01", baseAmount: "9000" });
    await createReceipt(db, ctx, { invoiceId: ib.id, receiptDate: "2025-06-10", amount: "5000" });

    const db_ = await getProjectDashboard(db, b.id);
    expect(db_.money.actualCost).toBe("2000.00");
    expect(db_.money.materialsCost).toBe("1000.00");
    expect(db_.money.outstandingPayables).toBe("1750.00");
    expect(db_.money.invoiced).toBe("5000.00");
    expect(db_.money.received).toBe("5000.00");
    expect((await getProjectDashboard(db, a.id)).money.actualCost).toBe("0.00");
    expect((await getProjectDashboard(db, a.id)).money.invoiced).toBe("9000.00");
    expect((await getProjectDashboard(db, c.id)).money.actualCost).toBe("7.00");

    const list = await listProjects(db, { fy });
    expect(list.rows.find((r) => r.id === b.id)!.actualCost).toBe("2000.00");
    expect(list.rows.find((r) => r.id === a.id)!.received).toBe("0.00");

    const invoices = await listInvoices(db, {});
    expect(invoices.rows.find((i) => i.id === ib.id)!.status).toBe("paid");
    expect(invoices.rows.find((i) => i.id === ia.id)!.received).toBe("0.00");
    expect(invoices.rows.find((i) => i.id === ia.id)!.status).toBe("issued");
  });
});
