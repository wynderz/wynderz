import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { attendancePunches, attendanceRecords, importJobs, payrollRecords, timesheets } from "@/lib/portal/db/schema";
import { ctx, freshDb, friendly, hasDb } from "./helpers";
import { createYear, setYearStatus } from "@/lib/portal/services/financial-years";
import { createEmployee, listEmployees, updateEmployee } from "@/lib/portal/services/employees";
import { annualGrid, createPayroll, deletePayroll, generateMonth, listPayroll, recordPayment, updatePayroll } from "@/lib/portal/services/payroll";
import { commitImport, listImportJobs, previewImport, saveManualAttendance, startImport } from "@/lib/portal/services/attendance";
import { commitTimesheetImport, createTimesheet, previewTimesheetImport, timesheetSummary, updateTimesheet } from "@/lib/portal/services/timesheets";
import { updateSetting } from "@/lib/portal/services/settings";
import { addMoney } from "@/lib/portal/money";

const file = (lines: string[], name = "export.csv") => new File([lines.join("\n")], name, { type: "text/csv" });

const punchMapping = (employeeMatch: "device_user_id" | "employee_code" | "name") => ({
  sheet: "CSV",
  headerRow: 1,
  layout: "punches",
  employeeMatch,
  dateOrder: "DMY",
  columns: { employee: 0, dateTime: 1 },
});

const dailyMapping = {
  sheet: "CSV",
  headerRow: 1,
  layout: "daily",
  employeeMatch: "device_user_id",
  dateOrder: "DMY",
  columns: { employee: 0, date: 1, inTime: 2, outTime: 3, status: 4 },
};

describe.skipIf(!hasDb)("attendance import, payroll, timesheets, employees — edge cases", () => {
  let db: Db;
  let pool: Pool;
  let fy: number;
  let oldFy: number;
  const emp: Record<string, number> = {};
  const code: Record<string, string> = {};

  const recordsFor = (employeeId: number) =>
    db.select().from(attendanceRecords).where(eq(attendanceRecords.employeeId, employeeId)).orderBy(attendanceRecords.workDate);
  const punchCount = async (employeeId?: number) => {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(attendancePunches)
      .where(employeeId ? eq(attendancePunches.employeeId, employeeId) : undefined);
    return n;
  };

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    oldFy = (await createYear(db, ctx, { label: "FY 2024-25", startDate: "2024-04-01", endDate: "2025-03-31" })).id;
    fy = (await createYear(db, ctx, { label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31" })).id;
    await setYearStatus(db, ctx, oldFy, { status: "closed" });
    const mk = async (key: string, input: Record<string, unknown>) => {
      const row = await createEmployee(db, ctx, input);
      emp[key] = row.id;
      code[key] = row.employeeCode;
    };
    await mk("ravi", { name: "Ravi  Shankar", deviceUserId: "201", monthlySalary: "30000", joiningDate: "2025-04-01" });
    await mk("sita", { name: "Sita Devi", deviceUserId: "202", monthlySalary: "18000.50" });
    await mk("old", { name: "Old Worker", deviceUserId: "203", monthlySalary: "10000", status: "inactive", exitDate: "2025-12-31" });
    await mk("mohan1", { name: "Mohan Lal", deviceUserId: "204", monthlySalary: "12000" });
    await mk("mohan2", { name: "mohan lal", deviceUserId: "205", monthlySalary: "12000" });
    await mk("daily", { name: "Dinesh Daily", deviceUserId: "206", payType: "daily", dailyRate: "433.33" });
    await mk("late", { name: "Late Joiner", deviceUserId: "207", monthlySalary: "9000", joiningDate: "2026-04-15" });
  });
  afterAll(async () => pool?.end());

  /* ------------------------------------------------------------ employees */

  it("employees: auto codes skip custom codes, codes are case-insensitively unique, update keeps code", async () => {
    expect(code.ravi).toBe("EMP-001");
    const custom = await createEmployee(db, ctx, { name: "Custom Code", employeeCode: "emp-050" });
    const next = await createEmployee(db, ctx, { name: "Next Auto" });
    expect(next.employeeCode).toBe("EMP-051");
    await expect(friendly(createEmployee(db, ctx, { name: "Dup", employeeCode: "EMP-050" }))).rejects.toThrow(/already exists/);
    // A very long numeric code must not break auto-numbering for everyone else.
    await createEmployee(db, ctx, { name: "Long code", employeeCode: "EMP-99999999999" });
    const after = await createEmployee(db, ctx, { name: "After long" });
    expect(after.employeeCode).toBe("EMP-100000000000");

    // Imports match device IDs / codes ignoring case, spaces and leading zeros, so such near-duplicates
    // would make every import row for both employees ambiguous.
    await expect(createEmployee(db, ctx, { name: "Zero pad", deviceUserId: "0201" })).rejects.toThrow(/device ID/);
    await expect(updateEmployee(db, ctx, custom.id, { name: "Custom Code", employeeCode: "emp-050", deviceUserId: " 202 " })).rejects.toThrow(/device ID/);
    await expect(createEmployee(db, ctx, { name: "Code clash", employeeCode: " EMP-051 " })).rejects.toThrow(/already exists/);
    const updated = await updateEmployee(db, ctx, custom.id, { name: "Custom Code Renamed", employeeCode: "" });
    expect(updated.employeeCode).toBe("emp-050");
    await expect(updateEmployee(db, ctx, custom.id, { name: "x", joiningDate: "2026-01-02", exitDate: "2026-01-01" })).rejects.toThrow();

    const list = await listEmployees(db, { status: "inactive" });
    expect(list.rows.map((r) => r.id)).toEqual([emp.old]);
    const search = await listEmployees(db, { q: "202" });
    expect(search.rows.map((r) => r.id)).toEqual([emp.sita]);
  });

  /* ------------------------------------------------------------ attendance: matching */

  it("matches by employee code and name ignoring case/whitespace; leading zeros on device IDs", async () => {
    const byCode = await startImport(db, ctx, file(["Code,Time", ` ${code.ravi.toLowerCase()} ,02/03/2026 09:00`, `${code.ravi},02/03/2026 18:00`]));
    const p1 = await previewImport(db, byCode.jobId, punchMapping("employee_code"));
    expect(p1.unmatched).toEqual([]);
    expect(p1.validPunches).toBe(2);
    expect(p1.statusCounts).toEqual({ present: 1 });

    const byName = await startImport(db, ctx, file(["Name,Time", "  RAVI shankar ,02/03/2026 09:00", "sita   devi,02/03/2026 09:00"]));
    const p2 = await previewImport(db, byName.jobId, punchMapping("name"));
    expect(p2.unmatched).toEqual([]);
    expect(p2.validPunches).toBe(2);

    const byDevice = await startImport(db, ctx, file(["Id,Time", "0201,02/03/2026 09:00", "00202,02/03/2026 09:00"]));
    const p3 = await previewImport(db, byDevice.jobId, punchMapping("device_user_id"));
    expect(p3.unmatched).toEqual([]);
    expect(p3.validPunches).toBe(2);
  });

  it("ambiguous names are reported as errors and never guessed; unknown IDs are listed, not created", async () => {
    const job = await startImport(db, ctx, file(["Name,Time", "Mohan Lal,02/03/2026 09:00", "Mohan Lal,02/03/2026 18:00", "Nobody,02/03/2026 09:00"]));
    const p = await previewImport(db, job.jobId, punchMapping("name"));
    expect(p.ambiguous).toEqual(["Mohan Lal"]);
    expect(p.errors).toBe(2);
    expect(p.validPunches).toBe(0);
    expect(p.unmatched).toEqual([{ key: "Nobody", rows: 1 }]);
    await expect(commitImport(db, ctx, job.jobId, { mapping: punchMapping("name") })).rejects.toThrow(/No valid attendance rows/);
    expect(await punchCount()).toBe(0);
  });

  it("inactive employees still match by device ID (historical backfill)", async () => {
    const job = await startImport(db, ctx, file(["Id,Time", "203,01/12/2025 09:00", "203,01/12/2025 18:00"]));
    const p = await previewImport(db, job.jobId, punchMapping("device_user_id"));
    expect(p.unmatched).toEqual([]);
    expect(p.validPunches).toBe(2);
  });

  /* ------------------------------------------------------------ attendance: duplicates */

  const base = ["Id,Time", "201,03/03/2026 09:00", "201,03/03/2026 18:00", "202,03/03/2026 09:20", "202,03/03/2026 17:50"];

  it("same file re-uploaded (even renamed) is flagged and changes nothing", async () => {
    const first = await startImport(db, ctx, file([...base, "201,03/03/2026 09:00"], "march-a.csv"));
    expect(first.previousImport).toBeNull();
    const p = await previewImport(db, first.jobId, punchMapping("device_user_id"));
    expect(p.inFileDuplicates).toBe(1);
    expect(p.validPunches).toBe(4);
    const r = await commitImport(db, ctx, first.jobId, { mapping: punchMapping("device_user_id") });
    expect(r).toMatchObject({ inserted: 2, updated: 0, newPunches: 4 });

    const again = await startImport(db, ctx, file([...base, "201,03/03/2026 09:00"], "renamed.csv"));
    expect(again.previousImport?.id).toBe(r.job.id);
    const p2 = await previewImport(db, again.jobId, punchMapping("device_user_id"));
    expect(p2.alreadyImported).toBe(4);
    const r2 = await commitImport(db, ctx, again.jobId, { mapping: punchMapping("device_user_id") });
    expect(r2.newPunches).toBe(0);
    expect(await punchCount(emp.ravi)).toBe(2);
    expect((await recordsFor(emp.ravi)).filter((x) => x.workDate === "2026-03-03")).toHaveLength(1);
  });

  it("overlapping exports merge: only new punches are stored and days are rebuilt from all punches", async () => {
    // Overlaps on Sita's morning punch, adds an evening punch for 201 the next day and a near-duplicate scan.
    const job = await startImport(db, ctx, file(["Id,Time", "202,03/03/2026 09:20", "202,03/03/2026 09:21", "201,04/03/2026 09:00", "201,04/03/2026 13:00"]));
    const p = await previewImport(db, job.jobId, punchMapping("device_user_id"));
    expect(p.alreadyImported).toBe(1);
    const r = await commitImport(db, ctx, job.jobId, { mapping: punchMapping("device_user_id") });
    expect(r.newPunches).toBe(3);
    expect(r.inserted).toBe(1);
    expect(r.updated).toBe(1);
    const sita = (await recordsFor(emp.sita)).find((x) => x.workDate === "2026-03-03")!;
    // 09:21 is a double scan (within 2 min) and the 17:50 punch from the earlier file is kept.
    expect(sita).toMatchObject({ firstIn: "09:20:00", lastOut: "17:50:00", punchCount: 2, workedMinutes: 510, status: "present" });
    const ravi = (await recordsFor(emp.ravi)).find((x) => x.workDate === "2026-03-04")!;
    expect(ravi).toMatchObject({ status: "half_day", workedMinutes: 240 });
  });

  it("daily layout: one row per employee-day — duplicates within a file keep the first, re-imports update in place", async () => {
    const lines = ["Id,Date,In,Out,Status", "201,05/03/2026,09:00,18:00,P", "201,05/03/2026,10:00,11:00,P", "202,05/03/2026,,,L", "202,06/03/2026,18:00,09:00,"];
    const job = await startImport(db, ctx, file(lines));
    const p = await previewImport(db, job.jobId, dailyMapping);
    expect(p.inFileDuplicates).toBe(1);
    expect(p.dailyRecords).toBe(3);
    const r = await commitImport(db, ctx, job.jobId, { mapping: dailyMapping });
    expect(r).toMatchObject({ inserted: 3, updated: 0 });
    const ravi = (await recordsFor(emp.ravi)).find((x) => x.workDate === "2026-03-05")!;
    expect(ravi).toMatchObject({ firstIn: "09:00:00", lastOut: "18:00:00", workedMinutes: 540, status: "present" });
    const sita = await recordsFor(emp.sita);
    expect(sita.find((x) => x.workDate === "2026-03-05")?.status).toBe("leave");
    expect(sita.find((x) => x.workDate === "2026-03-06")).toMatchObject({ status: "missing_punch", workedMinutes: null });

    const again = await startImport(db, ctx, file(["Id,Date,In,Out,Status", "201,05/03/2026,09:00,13:30,"]));
    const r2 = await commitImport(db, ctx, again.jobId, { mapping: dailyMapping });
    expect(r2).toMatchObject({ inserted: 0, updated: 1 });
    const rows = (await recordsFor(emp.ravi)).filter((x) => x.workDate === "2026-03-05");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "half_day", workedMinutes: 270 });
  });

  it("manual records are never overwritten by an import of the same employee-date", async () => {
    await saveManualAttendance(db, ctx, { employeeId: emp.ravi, workDate: "2026-03-09", status: "leave" });
    const job = await startImport(db, ctx, file(["Id,Time", "201,09/03/2026 09:00", "201,09/03/2026 18:00"]));
    const p = await previewImport(db, job.jobId, punchMapping("device_user_id"));
    expect(p.manualKept).toBe(1);
    const r = await commitImport(db, ctx, job.jobId, { mapping: punchMapping("device_user_id") });
    expect(r).toMatchObject({ inserted: 0, updated: 0, keptManual: 1, newPunches: 2 });
    const rec = (await recordsFor(emp.ravi)).find((x) => x.workDate === "2026-03-09")!;
    expect(rec).toMatchObject({ status: "leave", source: "manual" });
  });

  it("night shifts: punches before the day cutoff belong to the previous day, also after re-import", async () => {
    await updateSetting(db, ctx, "attendance", { dayCutoff: "04:00" });
    try {
      const lines = ["Id,Time", "202,10/03/2026 22:00", "202,11/03/2026 06:30"];
      const job = await startImport(db, ctx, file(lines));
      await commitImport(db, ctx, job.jobId, { mapping: punchMapping("device_user_id") });
      const more = await startImport(db, ctx, file(["Id,Time", "202,11/03/2026 02:00", "202,11/03/2026 06:30"]));
      const r = await commitImport(db, ctx, more.jobId, { mapping: punchMapping("device_user_id") });
      expect(r.newPunches).toBe(1);
      const days = (await recordsFor(emp.sita)).filter((x) => x.workDate >= "2026-03-10" && x.workDate <= "2026-03-11");
      expect(days).toHaveLength(2);
      const d10 = days.find((x) => x.workDate === "2026-03-10")!;
      expect(d10).toMatchObject({ firstIn: "22:00:00", lastOut: "02:00:00", workedMinutes: 240, status: "half_day" });
      expect(days.find((x) => x.workDate === "2026-03-11")).toMatchObject({ punchCount: 1, status: "missing_punch" });
    } finally {
      await updateSetting(db, ctx, "attendance", {});
    }
  });

  it("commit is all-or-nothing: a closed year blocks the whole import until a correction reason is given", async () => {
    const lines = ["Id,Time", "201,31/03/2025 09:00", "201,31/03/2025 18:00", "201,01/04/2025 09:00", "201,01/04/2025 18:00"];
    const job = await startImport(db, ctx, file(lines));
    const p = await previewImport(db, job.jobId, punchMapping("device_user_id"));
    expect(p.closedYears).toEqual([{ label: "FY 2024-25", status: "closed" }]);
    const before = await punchCount(emp.ravi);
    await expect(commitImport(db, ctx, job.jobId, { mapping: punchMapping("device_user_id") })).rejects.toThrow(/closed/);
    expect(await punchCount(emp.ravi)).toBe(before);
    expect((await recordsFor(emp.ravi)).filter((x) => x.workDate <= "2025-04-01")).toHaveLength(0);
    const [pending] = await db.select().from(importJobs).where(eq(importJobs.id, job.jobId));
    expect(pending.status).not.toBe("completed");

    const r = await commitImport(db, ctx, job.jobId, { mapping: punchMapping("device_user_id"), correctionReason: "Late device sync" });
    expect(r).toMatchObject({ inserted: 2, newPunches: 4 });
  });

  it("markAbsent fills only active employees on working days within their employment", async () => {
    // 2026-03-15 is a Sunday (weekly off), 2026-03-16 a Monday.
    const job = await startImport(db, ctx, file(["Id,Time", "201,14/03/2026 09:00", "201,14/03/2026 18:00", "201,16/03/2026 09:00", "201,16/03/2026 18:00"]));
    await commitImport(db, ctx, job.jobId, { mapping: punchMapping("device_user_id"), markAbsent: true });
    const absent = await db
      .select({ e: attendanceRecords.employeeId, d: attendanceRecords.workDate })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.status, "absent"), sql`${attendanceRecords.workDate} between '2026-03-14' and '2026-03-16'`));
    const ids = new Set(absent.map((a) => a.e));
    expect(absent.some((a) => a.d === "2026-03-15")).toBe(false);
    expect(ids.has(emp.ravi)).toBe(false);
    expect(ids.has(emp.old)).toBe(false);
    expect(ids.has(emp.late)).toBe(false);
    expect(absent.filter((a) => a.e === emp.sita).map((a) => a.d).sort()).toEqual(["2026-03-14", "2026-03-16"]);
  });

  it("import history lists jobs newest first with their outcome", async () => {
    const jobs = await listImportJobs(db, "attendance");
    expect(jobs.length).toBeGreaterThan(5);
    const created = jobs.map((j) => j.createdAt.getTime());
    expect([...created].sort((a, b) => b - a)).toEqual(created);
    const done = jobs.filter((j) => j.status === "completed");
    expect(done.every((j) => j.completedAt && j.periodStart && j.mappingConfig)).toBe(true);
    const daily = done.find((j) => (j.mappingConfig as { layout: string }).layout === "daily" && j.importedRows === 3)!;
    expect(daily).toMatchObject({ periodStart: "2026-03-05", periodEnd: "2026-03-06", totalRows: 4, errorRows: 0 });
    await expect(commitImport(db, ctx, daily.id, { mapping: dailyMapping })).rejects.toThrow(/already/);
  });

  /* ------------------------------------------------------------ payroll */

  it("generateMonth: attendance-based days, never overwrites, safe under concurrent runs", async () => {
    
    const manual = await createPayroll(db, ctx, { employeeId: emp.sita, periodMonth: "2026-03", daysPaid: "10" });
    const [a, b] = await Promise.all([generateMonth(db, ctx, { periodMonth: "2026-03" }), generateMonth(db, ctx, { periodMonth: "2026-03" })]);
    expect(a.created + b.created).toBeGreaterThan(0);
    const rows = await db.select().from(payrollRecords).where(eq(payrollRecords.periodMonth, "2026-03-01"));
    const perEmp = new Map<number, number>();
    for (const r of rows) perEmp.set(r.employeeId, (perEmp.get(r.employeeId) ?? 0) + 1);
    expect([...perEmp.values()].every((n) => n === 1)).toBe(true);
    expect(rows.find((r) => r.employeeId === emp.sita)!.id).toBe(manual.id);
    expect(rows.find((r) => r.employeeId === emp.sita)!.daysPaid).toBe("10.0");

    const ravi = rows.find((r) => r.employeeId === emp.ravi)!;
    // 03 present, 04 half, 05 half (re-imported), 09 leave, 14 + 16 present = 4 days of 31.
    expect(Number(ravi.daysPaid)).toBe(4);
    expect(ravi.workingDays).toBe(31);
    expect(ravi.netPayable).toBe("3870.97"); // 30000 × 4 / 31 = 3870.967…
    expect(rows.some((r) => r.employeeId === emp.old)).toBe(false);
    expect(rows.some((r) => r.employeeId === emp.late)).toBe(false);
    // Dinesh (daily-paid) only has the absent days filled by markAbsent: a ₹0 record, not a skip.
    expect(rows.find((r) => r.employeeId === emp.daily)).toMatchObject({ daysPaid: "0.0", absentDays: "2.0", netPayable: "0.00" });
    const skipped = [...a.skipped, ...b.skipped].map((s) => s.employee);
    expect(skipped).toContain("Custom Code Renamed"); // no salary configured

    const third = await generateMonth(db, ctx, { periodMonth: "2026-03" });
    expect(third.created).toBe(0);
  });

  it("payroll money is exact: half days × odd rates, signed adjustments, totals match to the paisa", async () => {
    const d = await createPayroll(db, ctx, { employeeId: emp.daily, periodMonth: "2026-01", daysPaid: "12.5", allowances: "0.10", deductions: "0.20", attendanceAdjustment: "-0.01" });
    expect(d.earnedSalary).toBe("5416.63"); // 433.33 × 12.5 = 5416.625 → half-up
    expect(d.grossSalary).toBe("5416.72");
    expect(d.netPayable).toBe("5416.52");
    const s = await createPayroll(db, ctx, { employeeId: emp.sita, periodMonth: "2026-01", daysPaid: "20.5", advance: "1,000" });
    expect(s.earnedSalary).toBe("11903.56"); // 18000.50 × 20.5 / 31 = 11903.5564…
    expect(s.netPayable).toBe("10903.56");
    const big = await createPayroll(db, ctx, { employeeId: emp.ravi, periodMonth: "2026-01", advance: "40000" });
    expect(big.netPayable).toBe("0.00");
    await expect(createPayroll(db, ctx, { employeeId: emp.ravi, periodMonth: "2026-02", daysPaid: "31.5" })).rejects.toThrow();
    await expect(createPayroll(db, ctx, { employeeId: emp.ravi, periodMonth: "2026-02", workingDays: 26, daysPaid: "27" })).rejects.toThrow(/exceed/);

    const list = await listPayroll(db, { month: "2026-01" });
    expect(list.summary.net).toBe(addMoney(d.netPayable, s.netPayable, big.netPayable));
    const grid = await annualGrid(db, { mode: "calendar", year: 2026 });
    expect(grid.months).toHaveLength(12);
    expect(grid.totals["2026-01-01"]).toBe(addMoney(d.netPayable, s.netPayable, big.netPayable));
    expect(grid.grandTotal).toBe(addMoney(...Object.values(grid.totals)));
    expect(grid.grandTotal).toBe(addMoney(...grid.rows.map((r) => r.total)));
    const fyGrid = await annualGrid(db, { mode: "fy", fy, metric: "gross" });
    expect(fyGrid.months[0]).toBe("2025-04-01");
    expect(fyGrid.rows.find((r) => r.employeeId === emp.daily)!.cells["2026-01-01"].value).toBe("5416.72");
  });

  it("payroll duplicates, payments and deletes are guarded", async () => {
    const [rec] = await db.select().from(payrollRecords).where(and(eq(payrollRecords.employeeId, emp.sita), eq(payrollRecords.periodMonth, "2026-01-01")));
    await expect(friendly(createPayroll(db, ctx, { employeeId: emp.sita, periodMonth: "2026-01-15" }))).rejects.toThrow(/already exists/);
    const other = await createPayroll(db, ctx, { employeeId: emp.sita, periodMonth: "2025-12" });
    await expect(friendly(updatePayroll(db, ctx, other.id, { employeeId: emp.sita, periodMonth: "2026-01" }))).rejects.toThrow(/already exists/);
    const part = await recordPayment(db, ctx, rec.id, { amountPaid: "5000" });
    expect(part.paymentStatus).toBe("partial");
    await expect(deletePayroll(db, ctx, rec.id)).rejects.toThrow(/payments/);
    await expect(createPayroll(db, ctx, { employeeId: emp.ravi, periodMonth: "2025-03" })).rejects.toThrow(/closed/);
  });

  /* ------------------------------------------------------------ timesheets */

  it("timesheet import: matching, project lookup, hours-only rows, idempotent re-import", async () => {
    const lines = [
      "Employee,Date,Task,Start,End,Break,Hours",
      " ravi  shankar ,02/03/2026,Wiring,09:00,17:30,30,",
      "Sita Devi,02/03/2026,Testing,,,,6.5",
      "Sita Devi,02/03/2026,Testing,,,,6.5",
      "Mohan Lal,02/03/2026,Packing,09:00,10:00,,",
      "Ghost,02/03/2026,Nothing,09:00,10:00,,",
      "Sita Devi,03/03/2026,Bad,18:00,09:00,,",
    ];
    const mapping = { sheet: "CSV", headerRow: 1, employeeMatch: "name", dateOrder: "DMY", columns: { employee: 0, date: 1, task: 2, start: 3, end: 4, break: 5, hours: 6 } };
    const job = await startImport(db, ctx, file(lines, "ts.csv"), "timesheet");
    const p = await previewTimesheetImport(db, job.jobId, mapping);
    expect(p.validRows).toBe(3);
    expect(p.errors).toBe(2);
    expect(p.unmatched).toEqual([{ key: "Ghost", rows: 1 }]);
    const r = await commitTimesheetImport(db, ctx, job.jobId, { mapping });
    expect(r).toMatchObject({ inserted: 2, duplicates: 1, errorRows: 2 });
    const again = await startImport(db, ctx, file(lines, "ts-again.csv"), "timesheet");
    const r2 = await commitTimesheetImport(db, ctx, again.jobId, { mapping });
    expect(r2).toMatchObject({ inserted: 0, duplicates: 3 });
    const [hist] = await db.select().from(importJobs).where(eq(importJobs.id, again.jobId));
    expect(hist).toMatchObject({ status: "completed", totalRows: 6, importedRows: 0, skippedRows: 4, errorRows: 2 });
    const stored = await db.select().from(timesheets).where(eq(timesheets.source, "import"));
    expect(stored.map((t) => t.totalMinutes).sort()).toEqual([390, 480]);
  });

  it("timesheets: update recomputes minutes and respects closed years; summaries group by month", async () => {
    const t = await createTimesheet(db, ctx, { employeeId: emp.sita, workDate: "2026-03-20", task: "QA", hours: "2.25" });
    expect(t.totalMinutes).toBe(135);
    const u = await updateTimesheet(db, ctx, t.id, { employeeId: emp.sita, workDate: "2026-03-20", task: "QA", startTime: "10:00", endTime: "12:00", breakMinutes: 15 });
    expect(u.totalMinutes).toBe(105);
    await expect(updateTimesheet(db, ctx, t.id, { employeeId: emp.sita, workDate: "2025-03-20", task: "QA", hours: 1 })).rejects.toThrow(/closed/);
    await expect(createTimesheet(db, ctx, { employeeId: emp.sita, workDate: "2026-03-20", task: "QA", startTime: "10:00" })).rejects.toThrow();
    await expect(createTimesheet(db, ctx, { employeeId: emp.sita, workDate: "2026-03-20", task: "QA", startTime: "10:00", endTime: "10:30", breakMinutes: 45 })).rejects.toThrow(/Break/);
    const months = await timesheetSummary(db, { fy }, "month");
    const march = months.find((m) => m.key === "2026-03")!;
    expect(march.minutes).toBe(390 + 480 + 105);
  });
});
