import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/portal/db";
import { attendanceRecords } from "@/lib/portal/db/schema";
import { commitImport, previewImport, saveManualAttendance, startImport } from "@/lib/portal/services/attendance";
import { createEmployee } from "@/lib/portal/services/employees";
import { createYear } from "@/lib/portal/services/financial-years";
import { ctx, freshDb, hasDb } from "./helpers";

let cached: ArrayBuffer | null = null;

/** Builds a register workbook in the device's format: title row, DATE header, a mark per employee, an over-time block. */
async function registerFile(name = "register.xlsx") {
  if (cached) return new File([cached], name);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("APRIL");
  ws.addRow(["APRIL ATTENDENCE", null, null, null, null, "APRIL ATTENDENCE (over time)"]);
  ws.addRow(["DATE", "ASHA", "RAVI", "MEERA", null, "DATE", "ASHA", "RAVI"]);
  const day = (n: number) => new Date(Date.UTC(2026, 3, n));
  ws.addRow([day(1), "P", "P", "ABSENT", null, day(1), "OVER TIME UPTO 8 PM", null]);
  ws.addRow([day(2), "P", "p", "P", null, day(2)]);
  ws.addRow([day(3), "UGADI", "UGADI", "UGADI", null, day(3)]);
  ws.addRow([day(7), "TUESDAY HOLIDAY", "TUESDAY HOLIDAY", "TUESDAY HOLIDAY", null, day(7)]);
  ws.addRow([day(8), "P", "ABSENT", "P", null, day(8)]);
  cached = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new File([cached], name);
}

const mapping = { sheet: "*", layout: "register" as const };

describe.skipIf(!hasDb)("attendance register import (device format)", () => {
  let db: Db;
  let pool: Pool;
  const emp: Record<string, number> = {};

  beforeAll(async () => {
    ({ db, pool } = await freshDb());
    await createYear(db, ctx, { label: "FY 2026-27", startDate: "2026-04-01", endDate: "2027-03-31" });
    emp.asha = (await createEmployee(db, ctx, { name: "Asha Devi", deviceUserId: "ASHA", monthlySalary: "15000" })).id;
    emp.ravi = (await createEmployee(db, ctx, { name: "Ravi Teja", monthlySalary: "13000" })).id; // matched by first name
    emp.meera = (await createEmployee(db, ctx, { name: "Meera", monthlySalary: "12000" })).id;
  });
  afterAll(async () => pool?.end());

  it("detects the register on upload and previews without writing", async () => {
    const started = await startImport(db, ctx, await registerFile());
    expect(started.sheets[0].suggested.layout).toBe("register");
    expect(started.sheets[0].register).toEqual([{ headerRow: 2, title: "APRIL ATTENDENCE", employees: 3 }]);

    const preview = await previewImport(db, started.jobId, mapping);
    expect(preview.dailyRecords).toBe(15); // 5 dates × 3 people
    expect(preview.statusCounts).toEqual({ present: 7, absent: 2, holiday: 3, weekly_off: 3 });
    expect(preview.unmatched).toEqual([]);
    expect(preview.period).toEqual({ start: "2026-04-01", end: "2026-04-08" });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attendanceRecords);
    expect(n).toBe(0);
  });

  it("commits idempotently, keeps manual records, and stores over-time notes", async () => {
    await saveManualAttendance(db, ctx, { employeeId: emp.meera, workDate: "2026-04-08", status: "leave", notes: "Approved leave" });
    const started = await startImport(db, ctx, await registerFile());
    const r = await commitImport(db, ctx, started.jobId, { mapping, markAbsent: true });
    expect(r.inserted).toBe(14);
    expect(r.keptManual).toBe(1);

    const [asha1] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, emp.asha), eq(attendanceRecords.workDate, "2026-04-01")));
    expect(asha1).toMatchObject({ status: "present", notes: "OT: OVER TIME UPTO 8 PM", source: "import" });
    const [meera8] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, emp.meera), eq(attendanceRecords.workDate, "2026-04-08")));
    expect(meera8).toMatchObject({ status: "leave", source: "manual" });

    // markAbsent is ignored for registers: no invented absences on the blank dates (4–6 April).
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(attendanceRecords);
    expect(n).toBe(15);

    // Uploading the same register again changes nothing.
    const again = await startImport(db, ctx, await registerFile("register-copy.xlsx"));
    expect(again.previousImport).not.toBeNull();
    const r2 = await commitImport(db, ctx, again.jobId, { mapping });
    expect(r2.inserted).toBe(0);
    const [{ m }] = await db.select({ m: sql<number>`count(*)::int` }).from(attendanceRecords);
    expect(m).toBe(15);
  });
});
