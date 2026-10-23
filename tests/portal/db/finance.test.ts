import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { auditLogs, expenses } from "@/lib/portal/db/schema";
import { categoryTotals } from "./totals";
import { categoryId, ctx, freshDb, friendly, hasDb } from "./helpers";
import { createYear, deleteYear, setYearStatus, suggestNextYear, updateYear } from "@/lib/portal/services/financial-years";
import { createProject, getProjectDashboard, listProjects } from "@/lib/portal/services/projects";
import { createExpense, listExpenses, setExpenseArchived, updateExpense } from "@/lib/portal/services/expenses";
import { createMaterial, setMaterialArchived, updateMaterial } from "@/lib/portal/services/materials";
import { createSupplier } from "@/lib/portal/services/suppliers";
import { createInvoice, createReceipt, listInvoices } from "@/lib/portal/services/receivables";
import { financeTotals, yearComparison } from "@/lib/portal/queries/finance";

describe.skipIf(!hasDb)("financial years, projects, expenses, materials", () => {
  let db: Db;
  let pool: Pool;
  let fy25: number;
  let fy26: number;
  let projectId: number;
  let supplierId: number;
  let catTravel: number;
  let catMaterialBearings: number;

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    catTravel = await categoryId(db, "expense", "Travel & Stay");
    catMaterialBearings = await categoryId(db, "material", "Bearings");
  });
  afterAll(async () => pool?.end());

  it("creates financial years dynamically and rejects overlaps", async () => {
    expect((await suggestNextYear(db, new Date("2025-06-01"))).label).toBe("FY 2025-26");
    fy25 = (await createYear(db, ctx, { label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31", budget: "5000000" })).id;
    const next = await suggestNextYear(db);
    expect(next).toEqual({ label: "FY 2026-27", startDate: "2026-04-01", endDate: "2027-03-31" });
    fy26 = (await createYear(db, ctx, next)).id;
    await expect(createYear(db, ctx, { label: "Overlap", startDate: "2026-01-01", endDate: "2026-12-31" })).rejects.toThrow(/overlap/);
    await expect(createYear(db, ctx, { label: "Bad", startDate: "2030-04-01", endDate: "2030-03-31" })).rejects.toThrow();
  });

  it("creates projects as rows with auto codes, and a supplier", async () => {
    const p = await createProject(db, ctx, { name: "TFT Chennai Machine", financialYearId: fy25, customer: "TFT Chennai", budget: "2500000", contractValue: "3500000" });
    expect(p.code).toBe("PRJ-001");
    projectId = p.id;
    const p2 = await createProject(db, ctx, { name: "Second", financialYearId: fy25 });
    expect(p2.code).toBe("PRJ-002");
    await expect(friendly(createProject(db, ctx, { code: "prj-001", name: "Dup", financialYearId: fy25 }))).rejects.toThrow();
    supplierId = (await createSupplier(db, ctx, { name: "S.K Belts and Bearings", gstin: "36abcde1234f1z5" })).id;
  });

  it("computes expense amounts on the server and assigns the year from the date", async () => {
    const e = await createExpense(db, ctx, {
      expenseDate: "2025-05-10",
      projectId,
      categoryId: catTravel,
      description: "Site visit",
      quantity: "2",
      unitPrice: "1500.50",
      gstRate: "18",
      paymentStatus: "paid",
    });
    expect(e.baseAmount).toBe("3001.00");
    expect(e.gstAmount).toBe("540.18");
    expect(e.totalAmount).toBe("3541.18");
    expect(e.amountPaid).toBe("3541.18");
    expect(e.paymentStatus).toBe("paid");
    expect(e.financialYearId).toBe(fy25);

    const office = await createExpense(db, ctx, { expenseDate: "2026-04-02", categoryId: catTravel, description: "Office travel", baseAmount: "1000", amountPaid: "400" });
    expect(office.financialYearId).toBe(fy26);
    expect(office.paymentStatus).toBe("partial");

    await expect(createExpense(db, ctx, { expenseDate: "2024-01-01", categoryId: catTravel, description: "x", baseAmount: "1" })).rejects.toThrow(/No financial year/);
    await expect(createExpense(db, ctx, { expenseDate: "2025-05-10", categoryId: catTravel, description: "x", baseAmount: "10", amountPaid: "11" })).rejects.toThrow(/exceed/);
    await expect(createExpense(db, ctx, { expenseDate: "2025-05-10", categoryId: catMaterialBearings, description: "x", baseAmount: "10" })).rejects.toThrow(/category/);
  });

  it("links purchased materials to exactly one expense — no double counting", async () => {
    const before = await financeTotals(db, { fy: fy25 });
    const m = await createMaterial(db, ctx, {
      projectId,
      categoryId: catMaterialBearings,
      supplierId,
      itemName: "Bearing 61838",
      quantity: "2",
      unitCost: "50000",
      gstRate: "18",
      status: "received",
      purchaseDate: "2025-06-01",
      paymentStatus: "paid",
    });
    expect(m.totalAmount).toBe("118000.00");
    expect(m.expenseId).toBeTruthy();
    const after = await financeTotals(db, { fy: fy25 });
    // Recorded expenditure grows by the material total exactly once.
    expect(Number(after.recordedExpenditure) - Number(before.recordedExpenditure)).toBe(118000);
    expect(after.materialsCosts).toBe("118000.00");

    // A planned item is an estimate only — no spend.
    const planned = await createMaterial(db, ctx, { projectId, categoryId: catMaterialBearings, itemName: "Spare bearing", quantity: "1", unitCost: "1000", status: "planned", financialYearId: fy25 });
    expect(planned.expenseId).toBeNull();
    expect((await financeTotals(db, { fy: fy25 })).recordedExpenditure).toBe(after.recordedExpenditure);

    // Editing the material updates its linked expense, never adds another.
    await updateMaterial(db, ctx, m.id, { projectId, categoryId: catMaterialBearings, supplierId, itemName: "Bearing 61838", quantity: "3", unitCost: "50000", gstRate: "18", status: "received", purchaseDate: "2025-06-01", paymentStatus: "paid" });
    const t3 = await financeTotals(db, { fy: fy25 });
    expect(Number(t3.recordedExpenditure) - Number(before.recordedExpenditure)).toBe(177000);
    const linked = await db.select().from(expenses).where(sql`${expenses.source} = 'material'`);
    expect(linked).toHaveLength(1);

    // The linked expense cannot be edited directly.
    await expect(updateExpense(db, ctx, m.expenseId!, { expenseDate: "2025-06-01", categoryId: catTravel, description: "hack", baseAmount: "1" })).rejects.toThrow(/Materials/);

    // Moving back to planned removes the spend; archiving a purchased item archives its expense.
    await updateMaterial(db, ctx, m.id, { projectId, categoryId: catMaterialBearings, itemName: "Bearing 61838", quantity: "3", unitCost: "50000", gstRate: "18", status: "planned", financialYearId: fy25 });
    expect((await financeTotals(db, { fy: fy25 })).materialsCosts).toBe("0.00");
    await updateMaterial(db, ctx, m.id, { projectId, categoryId: catMaterialBearings, itemName: "Bearing 61838", quantity: "1", unitCost: "1000", status: "received", purchaseDate: "2025-06-02" });
    expect((await financeTotals(db, { fy: fy25 })).materialsCosts).toBe("1000.00");
    await setMaterialArchived(db, ctx, m.id, true);
    expect((await financeTotals(db, { fy: fy25 })).materialsCosts).toBe("0.00");
  });

  it("keeps invoiced, received and contract value separate", async () => {
    const inv = await createInvoice(db, ctx, { projectId, invoiceNumber: "37a", invoiceDate: "2025-09-30", baseAmount: "5728000", gstRate: "18" });
    expect(inv.totalAmount).toBe("6759040.00");
    await createReceipt(db, ctx, { invoiceId: inv.id, receiptDate: "2025-10-15", amount: "3000000" });
    const list = await listInvoices(db, { fy: fy25 });
    expect(list.rows[0].status).toBe("partially_paid");
    expect(list.summary.outstanding).toBe("3759040.00");
    const t = await financeTotals(db, { fy: fy25 });
    expect(t.invoiced).toBe("6759040.00");
    expect(t.received).toBe("3000000.00");
    expect(t.receivables).toBe("3759040.00");
    expect(t.contractValue).toBe("3500000.00");
    await expect(friendly(createInvoice(db, ctx, { invoiceNumber: "37A", invoiceDate: "2025-09-30", baseAmount: "1" }))).rejects.toThrow(/already exists/);
  });

  it("project dashboard and list agree with the master totals", async () => {
    const dash = await getProjectDashboard(db, projectId);
    const list = await listProjects(db, { fy: fy25 });
    const row = list.rows.find((r) => r.id === projectId)!;
    expect(row.actualCost).toBe(dash.money.actualCost);
    const t = await financeTotals(db, { fy: fy25 });
    expect(t.projectCosts).toBe(dash.money.actualCost);
    const years = await yearComparison(db);
    expect(years.find((y) => y.id === fy25)!.totalExpenditure).toBe(t.recordedExpenditure);
    const ex = await listExpenses(db, { fy: fy25 });
    expect(ex.summary.sumTotal).toBe(t.expensesTotal);
    expect(await categoryTotals(db, fy25)).toBe(t.expensesTotal);
  });

  it("protects closed years; corrections need a reason and are audited; archived years are read-only", async () => {
    await setYearStatus(db, ctx, fy25, { status: "closed" });
    const input = { expenseDate: "2025-07-01", categoryId: catTravel, description: "Late bill", baseAmount: "100" };
    await expect(createExpense(db, ctx, input)).rejects.toThrow(/closed/);
    const corrected = await createExpense(db, ctx, { ...input, correctionReason: "Bill received after close" });
    expect(corrected.totalAmount).toBe("100.00");
    const logs = await db.select().from(auditLogs).where(sql`${auditLogs.summary} like '%closed-year correction%'`);
    expect(logs.length).toBeGreaterThan(0);
    await setYearStatus(db, ctx, fy25, { status: "archived" });
    await expect(setExpenseArchived(db, ctx, corrected.id, true, "any reason")).rejects.toThrow(/archived/);
    await setYearStatus(db, ctx, fy25, { status: "open" });
    await setExpenseArchived(db, ctx, corrected.id, true);
  });

  it("refuses to move year boundaries past existing records or delete years with data", async () => {
    await expect(updateYear(db, ctx, fy25, { label: "FY 2025-26", startDate: "2025-06-01", endDate: "2026-03-31" })).rejects.toThrow(/outside/);
    await expect(deleteYear(db, ctx, fy25)).rejects.toThrow(/has records/);
    const empty = await createYear(db, ctx, { label: "FY 2030-31", startDate: "2030-04-01", endDate: "2031-03-31" });
    await deleteYear(db, ctx, empty.id);
  });
});
