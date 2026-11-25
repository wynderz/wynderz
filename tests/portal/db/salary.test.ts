import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { attendanceRecords, auditLogs, payrollRecords } from "@/lib/portal/db/schema";
import { ctx, freshDb, hasDb } from "./helpers";
import { maskAccount } from "@/lib/portal/bank";
import { createYear } from "@/lib/portal/services/financial-years";
import { createEmployee, getEmployee, maskEmployee, updateEmployee } from "@/lib/portal/services/employees";
import { createPayroll, generateMonth, recordPayment, salarySheet, updatePayroll } from "@/lib/portal/services/payroll";
import { getSetting, updateSetting } from "@/lib/portal/services/settings";
import { SALARY_SHEET_HEADERS } from "@/lib/portal/salary-sheet";
import { fileResponse } from "@/lib/portal/spreadsheet";

type Status = "present" | "absent" | "half_day" | "leave" | "missing_punch" | "holiday" | "weekly_off";

const iso = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;
const isTuesday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 2;

/** All fake people and fake account numbers. */
const ACC_A = "000011112222";
const ACC_A2 = "000033334444";

describe.skipIf(!hasDb)("salary payment: bank details, paid off days, rounding, salary sheet", () => {
  let db: Db;
  let pool: Pool;
  const emp: Record<string, number> = {};

  async function mark(employeeId: number, month: string, days: number, status: (d: string, day: number) => Status | null) {
    const rows = [];
    for (let day = 1; day <= days; day++) {
      const d = iso(month, day);
      const s = status(d, day);
      if (s) rows.push({ employeeId, workDate: d, status: s });
    }
    await db.insert(attendanceRecords).values(rows);
  }

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await createYear(db, ctx, { label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31" });
    emp.asha = (
      await createEmployee(db, ctx, { name: "Asha Testwala", monthlySalary: "13000", joiningDate: "2024-09-20", bankAccountNumber: "0000 1111 2222", bankIfsc: " abcd0123456 " })
    ).id;
    emp.bharat = (await createEmployee(db, ctx, { name: "Bharat Sample", monthlySalary: "20000", paymentMode: "cash" })).id;
    emp.chitra = (await createEmployee(db, ctx, { name: "Chitra Example", monthlySalary: "18000", joiningDate: "2026-01-15", bankAccountNumber: "123456789", bankIfsc: "WXYZ0A1B2C3" })).id;
    emp.dev = (await createEmployee(db, ctx, { name: "Dev Placeholder", monthlySalary: "15000" })).id;
  });
  afterAll(async () => pool?.end());

  /* ------------------------------------------------------------ employee bank details */

  it("validates and normalizes bank details; defaults payment mode to bank", async () => {
    const a = await getEmployee(db, emp.asha);
    expect(a).toMatchObject({ bankAccountNumber: ACC_A, bankIfsc: "ABCD0123456", paymentMode: "bank" });
    expect((await getEmployee(db, emp.bharat)).paymentMode).toBe("cash");
    await expect(createEmployee(db, ctx, { name: "Bad Ifsc", bankIfsc: "ABCD1234567" })).rejects.toThrow(/IFSC/);
    await expect(createEmployee(db, ctx, { name: "Short Ifsc", bankIfsc: "ABC0123456" })).rejects.toThrow(/IFSC/);
    await expect(createEmployee(db, ctx, { name: "Bad Account", bankAccountNumber: "12AB34567" })).rejects.toThrow(/Account number/);
    await expect(createEmployee(db, ctx, { name: "Tiny Account", bankAccountNumber: "123" })).rejects.toThrow(/Account number/);
    await expect(createEmployee(db, ctx, { name: "Bad Mode", paymentMode: "cheque" })).rejects.toThrow();
  });

  it("masks account numbers to the last 4 digits outside the edit form", async () => {
    expect(maskAccount(ACC_A)).toBe("••••2222");
    expect(maskAccount(null)).toBeNull();
    const masked = maskEmployee(await getEmployee(db, emp.asha));
    expect(masked.bankAccountNumber).toBe("••••2222");
    expect(masked.bankIfsc).toBe("ABCD0123456");
    expect(maskEmployee(await getEmployee(db, emp.dev)).bankAccountNumber).toBeNull();
  });

  it("keeps bank account numbers out of audit-log diffs (records only that they changed)", async () => {
    const before = await getEmployee(db, emp.asha);
    await updateEmployee(db, ctx, emp.asha, { ...before, bankAccountNumber: ACC_A2, phone: "99999 00000" });
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, "employee"), eq(auditLogs.entityId, String(emp.asha)), eq(auditLogs.action, "update")));
    const changes = log.changes as Record<string, { from: unknown; to: unknown }>;
    expect(changes.bankAccountNumber).toEqual({ from: "[redacted]", to: "[redacted]" });
    expect(changes.phone).toEqual({ from: null, to: "99999 00000" });
    // Put the original number back, then make sure no audit row anywhere carries either number.
    await updateEmployee(db, ctx, emp.asha, { ...before });
    const all = JSON.stringify(await db.select().from(auditLogs));
    expect(all).not.toContain(ACC_A);
    expect(all).not.toContain(ACC_A2);
    expect(all).not.toContain("123456789");
  });

  /* ------------------------------------------------------------ payroll policy */

  it("settings default to paid off days and rupee rounding", async () => {
    expect(await getSetting(db, "payroll")).toMatchObject({ paidOffDays: true, roundToRupee: true, prorateByDaysPaid: true });
  });

  it("generateMonth pays weekly offs and holidays: days to pay = days in month − absent", async () => {
    // January 2026: Tuesdays off, 26th a holiday, 7 absences → 31 − 7 = 24 days to pay.
    const absent = new Set([2, 5, 8, 9, 15, 22, 29]);
    await mark(emp.asha, "2026-01", 31, (d, day) => (isTuesday(d) ? "weekly_off" : day === 26 ? "holiday" : absent.has(day) ? "absent" : "present"));
    // Full month with offs and a holiday, no absences → "Full".
    await mark(emp.bharat, "2026-01", 31, (d, day) => (isTuesday(d) ? "weekly_off" : day === 26 ? "holiday" : "present"));
    // Joined on the 15th: 17 days employed, one leave + one missing punch unpaid → 15 days.
    // A stray record before joining must never be paid.
    await mark(emp.chitra, "2026-01", 31, (d, day) => (day === 10 ? "present" : day < 15 ? null : day === 20 ? "leave" : day === 21 ? "missing_punch" : isTuesday(d) ? "weekly_off" : "present"));

    const res = await generateMonth(db, ctx, { periodMonth: "2026-01" });
    expect(res.created).toBe(4);
    const rows = await db.select().from(payrollRecords).where(eq(payrollRecords.periodMonth, "2026-01-01"));
    const by = (id: number) => rows.find((r) => r.employeeId === id)!;

    expect(by(emp.asha)).toMatchObject({ workingDays: 31, daysPaid: "24.0", absentDays: "7.0", earnedSalary: "10064.52", netPayable: "10065.00" });
    expect(by(emp.bharat)).toMatchObject({ daysPaid: "31.0", absentDays: "0.0", netPayable: "20000.00" });
    expect(by(emp.chitra)).toMatchObject({ daysPaid: "15.0", absentDays: "0.0", earnedSalary: "8709.68", netPayable: "8710.00" });
    expect(by(emp.dev)).toMatchObject({ daysPaid: null, netPayable: "15000.00" }); // no attendance → full month

    // The reference example: 13000 / 31 × 24 − 2000 = 8064.52 → 8065.
    const a = await updatePayroll(db, ctx, by(emp.asha).id, { employeeId: emp.asha, periodMonth: "2026-01", daysPaid: "24", absentDays: "7", advance: "2000" });
    expect(a.netPayable).toBe("8065.00");
  });

  it("with paidOffDays off, weekly offs are unpaid; leave and missing punch are always unpaid", async () => {
    await updateSetting(db, ctx, "payroll", { paidOffDays: false });
    try {
      // February 2026 (28 days): 4 Tuesday offs, 1 half day, 1 leave, 1 missing punch, 1 absent, 20 present.
      await mark(emp.dev, "2026-02", 28, (d, day) => (isTuesday(d) ? "weekly_off" : day === 5 ? "half_day" : day === 6 ? "leave" : day === 7 ? "missing_punch" : day === 9 ? "absent" : "present"));
      await generateMonth(db, ctx, { periodMonth: "2026-02" });
      const [dev] = await db.select().from(payrollRecords).where(and(eq(payrollRecords.employeeId, emp.dev), eq(payrollRecords.periodMonth, "2026-02-01")));
      expect(dev).toMatchObject({ workingDays: 28, daysPaid: "20.5", absentDays: "1.5", earnedSalary: "10982.14", netPayable: "10982.00" });
    } finally {
      await updateSetting(db, ctx, "payroll", {});
    }
  });

  it("roundToRupee off keeps paise exact (8064.52)", async () => {
    await updateSetting(db, ctx, "payroll", { roundToRupee: false });
    try {
      const p = await createPayroll(db, ctx, { employeeId: emp.asha, periodMonth: "2026-03", daysPaid: "24", advance: "2000" });
      expect(p.netPayable).toBe("8064.52");
    } finally {
      await updateSetting(db, ctx, "payroll", {});
    }
    const p = await createPayroll(db, ctx, { employeeId: emp.bharat, periodMonth: "2026-03", daysPaid: "24", advance: "2000" });
    expect(p.netPayable).toBe("13484.00"); // default policy again: 20000 × 24 / 31 − 2000 = 13483.87 → 13484
  });

  /* ------------------------------------------------------------ salary sheet export */

  it("exports the month's Salary Payment sheet like the office workbook", async () => {
    const [bharat] = await db.select().from(payrollRecords).where(and(eq(payrollRecords.employeeId, emp.bharat), eq(payrollRecords.periodMonth, "2026-01-01")));
    await recordPayment(db, ctx, bharat.id, { amountPaid: "20000", paymentDate: "2026-02-03", paymentMethod: "Cash" });

    const sheet = await salarySheet(db, ctx, { month: "2026-01" });
    expect(sheet.fileName).toBe("wynderz-salary-payment-2026-01.xlsx");
    expect(sheet.rows).toBe(4);

    const res = fileResponse(sheet.body, sheet.fileName, "xlsx");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(await res.arrayBuffer()).buffer as ArrayBuffer);
    const ws = wb.getWorksheet("January 2026 Salary Payment")!;
    expect(ws).toBeTruthy();
    expect(ws.getCell(1, 1).value).toBe("January Salary Payment");
    const header = (ws.getRow(2).values as unknown[]).slice(1);
    expect(header).toEqual([...SALARY_SHEET_HEADERS]);
    expect(header.slice(0, 11)).toEqual(["S.No", "Name", "Employee ID", "Salary", "Adv", "Amount To Pay", "Days To Pay", "Absent", "Joining Date", "Paid", "Amount Paid"]);

    const col = (name: string) => SALARY_SHEET_HEADERS.indexOf(name as (typeof SALARY_SHEET_HEADERS)[number]) + 1;
    const row = (n: number) => ws.getRow(2 + n);
    // Sorted by name: Asha, Bharat, Chitra, Dev.
    expect([1, 2, 3, 4].map((n) => row(n).getCell(col("Name")).value)).toEqual(["Asha Testwala", "Bharat Sample", "Chitra Example", "Dev Placeholder"]);

    const asha = row(1);
    expect(asha.getCell(col("S.No")).value).toBe(1);
    expect(asha.getCell(col("Salary")).value).toBe(13000);
    expect(asha.getCell(col("Salary")).numFmt).toContain("₹");
    expect(asha.getCell(col("Adv")).value).toBe(2000);
    expect(asha.getCell(col("Amount To Pay")).value).toBe(8065);
    expect(asha.getCell(col("Days To Pay")).value).toBe(24);
    expect(asha.getCell(col("Absent")).value).toBe(7);
    expect(asha.getCell(col("Joining Date")).value).toBe("20 Sep 2024");
    expect(asha.getCell(col("Paid")).value).toBe("No");
    expect(asha.getCell(col("Mode")).value).toBe("Bank");
    expect(asha.getCell(col("A/C Number")).value).toBe(ACC_A); // full number, text (leading zeros kept)
    expect(asha.getCell(col("IFSC")).value).toBe("ABCD0123456");

    const b = row(2);
    expect(b.getCell(col("Days To Pay")).value).toBe("Full");
    expect(b.getCell(col("Paid")).value).toBe("Yes");
    expect(b.getCell(col("Amount Paid")).value).toBe(20000);
    expect(b.getCell(col("Payment Date")).value).toBe("03 Feb 2026");
    expect(b.getCell(col("Mode")).value).toBe("Cash");
    expect(b.getCell(col("A/C Number")).value).toBeNull();

    expect(row(3).getCell(col("Days To Pay")).value).toBe(15);
    expect(row(4).getCell(col("Days To Pay")).value).toBe("Full");

    const total = row(5);
    expect(total.getCell(col("Name")).value).toBe("Total");
    expect(total.getCell(col("Salary")).value).toBe(13000 + 20000 + 18000 + 15000);
    expect(total.getCell(col("Adv")).value).toBe(2000);
    expect(total.getCell(col("Amount To Pay")).value).toBe(8065 + 20000 + 8710 + 15000);
    expect(total.getCell(col("Amount Paid")).value).toBe(20000);
    expect(sheet.totals).toEqual({ salary: "66000.00", advance: "2000.00", amountToPay: "51775.00", amountPaid: "20000.00" });

    const exports = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "export"), eq(auditLogs.entity, "payroll")));
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ entityId: "2026-01-01", userEmail: ctx.userEmail });
    expect(JSON.stringify(exports[0])).not.toContain(ACC_A);
  });

  it("rejects a bad month and exports an empty month with a zero total row", async () => {
    await expect(salarySheet(db, ctx, { month: "2026-13" })).rejects.toThrow();
    await expect(salarySheet(db, ctx, {})).rejects.toThrow();
    const empty = await salarySheet(db, ctx, { month: "2025-05" });
    expect(empty.rows).toBe(0);
    expect(empty.totals.amountToPay).toBe("0.00");
  });
});
