import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { attendancePunches, attendanceRecords, users } from "@/lib/portal/db/schema";
import { ctx, freshDb, friendly, hasDb } from "./helpers";
import { createYear, setYearStatus } from "@/lib/portal/services/financial-years";
import { createEmployee } from "@/lib/portal/services/employees";
import { annualGrid, createPayroll, generateMonth, recordPayment } from "@/lib/portal/services/payroll";
import { commitImport, previewImport, saveManualAttendance, startImport } from "@/lib/portal/services/attendance";
import { createTimesheet } from "@/lib/portal/services/timesheets";
import { authenticate, createUser, deleteUser, setUserActive } from "@/lib/portal/services/users";
import { financeTotals } from "@/lib/portal/queries/finance";

const csv = (lines: string[]) => new File([lines.join("\n")], "device-export.csv", { type: "text/csv" });

describe.skipIf(!hasDb)("employees, payroll, attendance, timesheets, admins", () => {
  let db: Db;
  let pool: Pool;
  let fy: number;
  const emp: Record<string, number> = {};

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    fy = (await createYear(db, ctx, { label: "FY 2025-26", startDate: "2025-04-01", endDate: "2026-03-31" })).id;
    emp.pawan = (await createEmployee(db, ctx, { name: "Pawan Kumar", deviceUserId: "101", monthlySalary: "13000" })).id;
    emp.kunal = (await createEmployee(db, ctx, { name: "Kunal Ram", deviceUserId: "102", payType: "daily", dailyRate: "420" })).id;
    emp.pappu = (await createEmployee(db, ctx, { name: "Pappu Prasad", deviceUserId: "103", monthlySalary: "27000" })).id;
  });
  afterAll(async () => pool?.end());

  it("employees get stable auto codes and are not duplicated", async () => {
    await expect(friendly(createEmployee(db, ctx, { name: "Dup device", deviceUserId: "101" }))).rejects.toThrow(/device ID/);
    await expect(createEmployee(db, ctx, { name: "No rate", payType: "daily" })).rejects.toThrow();
  });

  it("payroll matches the reference calculation and is unique per employee-month", async () => {
    const p = await createPayroll(db, ctx, { employeeId: emp.pawan, periodMonth: "2026-01", daysPaid: "24", advance: "2000" });
    expect(p.workingDays).toBe(31);
    expect(p.netPayable).toBe("8064.52");
    expect(p.paymentStatus).toBe("unpaid");
    expect(p.financialYearId).toBe(fy);
    await expect(friendly(createPayroll(db, ctx, { employeeId: emp.pawan, periodMonth: "2026-01-01" }))).rejects.toThrow(/already exists/);
    const paid = await recordPayment(db, ctx, p.id, { amountPaid: "8064.52", paymentDate: "2026-02-01" });
    expect(paid.paymentStatus).toBe("paid");
    await expect(recordPayment(db, ctx, p.id, { amountPaid: "9000" })).rejects.toThrow(/exceed/);
  });

  let jobId: number;
  const mapping = {
    sheet: "CSV",
    headerRow: 1,
    layout: "punches",
    employeeMatch: "device_user_id",
    dateOrder: "DMY",
    columns: { employee: 0, dateTime: 2, deviceId: 3 },
  };
  const lines = [
    "AC-No,Name,Time,Device",
    "101,Pawan,02/02/2026 09:15,D1",
    "101,Pawan,02/02/2026 18:05,D1",
    "102,Kunal,02/02/2026 09:50,D1",
    "102,Kunal,02/02/2026 14:30,D1",
    "103,Pappu,02/02/2026 09:00,D1",
    "555,Unknown,02/02/2026 09:00,D1",
    "101,Pawan,03/02/2026 09:00,D1",
    "101,Pawan,03/02/2026 17:30,D1",
  ];

  it("previews a device export: matching, unmatched, statuses — writes nothing", async () => {
    const started = await startImport(db, ctx, csv(lines));
    jobId = started.jobId;
    expect(started.sheets[0].headers).toEqual(["AC-No", "Name", "Time", "Device"]);
    expect(started.sheets[0].suggested.employee).toBe(0);
    const preview = await previewImport(db, jobId, mapping);
    expect(preview.validPunches).toBe(7);
    expect(preview.unmatched).toEqual([{ key: "555", rows: 1 }]);
    expect(preview.statusCounts).toMatchObject({ present: 2, half_day: 1, missing_punch: 1 });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attendanceRecords);
    expect(n).toBe(0);
  });

  it("commits idempotently and never overwrites manual records", async () => {
    await saveManualAttendance(db, ctx, { employeeId: emp.pappu, workDate: "2026-02-02", status: "leave", notes: "Approved leave" });
    const r = await commitImport(db, ctx, jobId, { mapping, saveMappingName: "ZKTeco CSV" });
    expect(r.inserted).toBe(3);
    expect(r.keptManual).toBe(1);
    expect(r.unmatchedRows).toBe(1);
    await expect(commitImport(db, ctx, jobId, { mapping })).rejects.toThrow(/already/);

    // Re-uploading the same export changes nothing.
    const again = await startImport(db, ctx, csv(lines));
    expect(again.previousImport).not.toBeNull();
    expect(again.savedMappings.map((m) => m.name)).toContain("ZKTeco CSV");
    const p2 = await previewImport(db, again.jobId, mapping);
    expect(p2.alreadyImported).toBe(7);
    const r2 = await commitImport(db, ctx, again.jobId, { mapping });
    expect(r2.newPunches).toBe(0);
    expect(r2.inserted).toBe(0);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attendancePunches);
    expect(n).toBe(7);
    const [manual] = await db.select().from(attendanceRecords).where(sql`${attendanceRecords.employeeId} = ${emp.pappu}`);
    expect(manual.status).toBe("leave");

    // A later export with an extra punch merges into the stored day.
    const more = await startImport(db, ctx, csv(["AC-No,Name,Time,Device", "102,Kunal,02/02/2026 18:00,D1"]));
    await commitImport(db, ctx, more.jobId, { mapping });
    const [kunal] = await db.select().from(attendanceRecords).where(sql`${attendanceRecords.employeeId} = ${emp.kunal} and ${attendanceRecords.workDate} = '2026-02-02'`);
    expect(kunal.status).toBe("present");
    expect(kunal.workedMinutes).toBe(490);
  });

  it("generates monthly payroll from attendance without overwriting existing records", async () => {
    const res = await generateMonth(db, ctx, { periodMonth: "2026-02" });
    expect(res.created).toBe(3);
    const again = await generateMonth(db, ctx, { periodMonth: "2026-02" });
    expect(again.created).toBe(0);
    expect(again.existing).toBe(3);
    const grid = await annualGrid(db, { mode: "fy", fy });
    expect(grid.months).toHaveLength(12);
    const kunal = grid.rows.find((r) => r.employeeId === emp.kunal)!;
    expect(kunal.cells["2026-02-01"].value).toBe("420.00"); // 1 present day × ₹420
    const totals = await financeTotals(db, { fy });
    expect(totals.payrollNet).toBe(grid.grandTotal);
  });

  it("validates timesheets and respects closed years", async () => {
    const t = await createTimesheet(db, ctx, { employeeId: emp.pawan, workDate: "2026-02-02", task: "Assembly", startTime: "09:00", endTime: "18:00", breakMinutes: 60 });
    expect(t.totalMinutes).toBe(480);
    await expect(createTimesheet(db, ctx, { employeeId: emp.pawan, workDate: "2026-02-02", task: "Bad", startTime: "18:00", endTime: "09:00" })).rejects.toThrow(/after start/);
    await setYearStatus(db, ctx, fy, { status: "closed" });
    await expect(createTimesheet(db, ctx, { employeeId: emp.pawan, workDate: "2026-02-03", task: "Late", hours: 2 })).rejects.toThrow(/closed/);
    await setYearStatus(db, ctx, fy, { status: "open" });
  });

  it("admins: login, rate limiting, last-admin protection", async () => {
    const a = await createUser(db, ctx, { name: "Admin One", email: "One@Wynderz.in", password: "correct-horse-9" });
    expect(a.email).toBe("one@wynderz.in");
    await expect(createUser(db, ctx, { name: "Weak", email: "w@w.in", password: "short" })).rejects.toThrow();
    await expect(friendly(createUser(db, ctx, { name: "Dup", email: "ONE@wynderz.in", password: "another-pass-9" }))).rejects.toThrow(/already exists/);
    expect((await authenticate(db, "1.1.1.1", "one@wynderz.in", "correct-horse-9")).id).toBe(a.id);
    await expect(authenticate(db, "1.1.1.1", "one@wynderz.in", "wrong")).rejects.toThrow(/Incorrect/);
    await expect(authenticate(db, "1.1.1.1", "nobody@wynderz.in", "wrong")).rejects.toThrow(/Incorrect/);

    await expect(setUserActive(db, ctx, a.id, false)).rejects.toThrow(/last active admin/);
    const b = await createUser(db, ctx, { name: "Admin Two", email: "two@wynderz.in", password: "correct-horse-9" });
    await setUserActive(db, ctx, a.id, false);
    await expect(authenticate(db, "2.2.2.2", "one@wynderz.in", "correct-horse-9")).rejects.toThrow(/Incorrect/);
    await expect(setUserActive(db, ctx, b.id, false)).rejects.toThrow(/last active admin/);
    await expect(deleteUser(db, { ...ctx, userId: a.id }, b.id)).rejects.toThrow(/last active admin/);

    for (let i = 0; i < 8; i++) await authenticate(db, "3.3.3.3", "two@wynderz.in", "nope").catch(() => {});
    await expect(authenticate(db, "3.3.3.3", "two@wynderz.in", "correct-horse-9")).rejects.toThrow(/Too many/);
    const [stored] = await db.select().from(users).where(sql`${users.id} = ${b.id}`);
    expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
});
