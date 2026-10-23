import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import { daysInMonth, firstOfMonth, isIsoDate, lastOfMonth, monthLabel, monthsBetween, todayIso } from "../dates";
import type { Db, Tx } from "../db";
import { attendanceRecords, employees, financialYears, payrollRecords } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { compareMoney, derivePaymentStatus, normalizeMoney } from "../money";
import { calculatePayroll } from "../payroll-calc";
import { correction, id as idSchema, listQuery, optDate, optMoney, optText } from "../validation";
import { getSetting } from "./settings";
import { correctionNote, countAll, getYear, offset, orderBy, pageOf, search, writableYearFor } from "./shared";

const monthStr = z
  .string()
  .transform((v) => (/^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v))
  .refine(isIsoDate, "Choose a valid month")
  .transform(firstOfMonth);

const signedMoney = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? "0" : String(v).replace(/[,\s₹]/g, "")))
  .refine((v) => /^-?\d{1,12}(\.\d{1,2})?$/.test(v), "Must be a valid amount");

const days = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)))
  .refine((v) => v === null || (/^\d{1,2}(\.5|\.0)?$/.test(v) && Number(v) <= 31), "Use whole or half days (max 31)");

export const payrollInput = z.object({
  employeeId: idSchema,
  periodMonth: monthStr,
  payType: z.enum(["monthly", "daily"]).optional(),
  baseSalary: optMoney,
  workingDays: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 31), "1–31"),
  daysPaid: days,
  absentDays: days,
  allowances: optMoney,
  deductions: optMoney,
  advance: optMoney,
  attendanceAdjustment: signedMoney,
  amountPaid: optMoney,
  paymentDate: optDate,
  paymentMethod: optText(40),
  notes: optText(2000),
  ...correction,
});

export const paymentInput = z.object({
  amountPaid: optMoney.refine((v) => v !== null, "Required"),
  paymentDate: optDate,
  paymentMethod: optText(40),
  ...correction,
});

export const generateInput = z.object({
  periodMonth: monthStr,
  useAttendance: z.boolean().default(true),
  ...correction,
});

export const payrollListQuery = listQuery.extend({
  employeeId: z.coerce.number().int().positive().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
});

async function buildRecord(tx: Tx, input: z.infer<typeof payrollInput>) {
  const emp = await tx.select().from(employees).where(eq(employees.id, input.employeeId)).then((r) => r[0]);
  if (!emp) throw new AppError("Choose a valid employee.");
  const policy = await getSetting(tx, "payroll");
  const payType = input.payType ?? emp.payType;
  const baseSalary = input.baseSalary ?? (payType === "daily" ? emp.dailyRate : emp.monthlySalary);
  if (!baseSalary) throw new AppError(payType === "daily" ? "Set a daily rate for this employee or enter it here." : "Set a monthly salary for this employee or enter it here.");
  const workingDays =
    input.workingDays ?? (policy.workingDaysMode === "fixed" ? policy.fixedWorkingDays : daysInMonth(input.periodMonth));
  let calc;
  try {
    calc = calculatePayroll({
      payType,
      baseSalary,
      workingDays,
      daysPaid: input.daysPaid,
      allowances: input.allowances ?? "0",
      deductions: input.deductions ?? "0",
      advance: input.advance ?? "0",
      attendanceAdjustment: input.attendanceAdjustment,
      prorateByDaysPaid: policy.prorateByDaysPaid,
    });
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  const amountPaid = input.amountPaid ? normalizeMoney(input.amountPaid) : "0.00";
  if (compareMoney(amountPaid, calc.netPayable) > 0) throw new AppError("Amount paid cannot exceed net payable.");
  const { fy, isCorrection } = await writableYearFor(tx, input.periodMonth, input.correctionReason);
  return {
    isCorrection,
    values: {
      employeeId: emp.id,
      financialYearId: fy.id,
      periodMonth: input.periodMonth,
      payType,
      baseSalary: normalizeMoney(baseSalary),
      workingDays,
      daysPaid: input.daysPaid,
      absentDays: input.absentDays,
      allowances: normalizeMoney(input.allowances ?? "0"),
      deductions: normalizeMoney(input.deductions ?? "0"),
      advance: normalizeMoney(input.advance ?? "0"),
      attendanceAdjustment: normalizeMoney(input.attendanceAdjustment),
      ...calc,
      amountPaid,
      paymentStatus: derivePaymentStatus(calc.netPayable, amountPaid),
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    },
  };
}

export async function createPayroll(db: Db, ctx: Ctx, raw: unknown) {
  const input = payrollInput.parse(raw);
  return db.transaction(async (tx) => {
    const { values, isCorrection } = await buildRecord(tx, input);
    const [row] = await tx.insert(payrollRecords).values(values).returning();
    await audit(tx, ctx, { action: "create", entity: "payroll", entityId: row.id, summary: `Payroll ${row.periodMonth.slice(0, 7)} employee #${row.employeeId}: net ₹${row.netPayable}${correctionNote(isCorrection, input.correctionReason)}` });
    return row;
  });
}

export async function updatePayroll(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = payrollInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(payrollRecords).where(eq(payrollRecords.id, id));
    if (!before) throw notFound("Payroll record");
    const prev = await writableYearFor(tx, before.periodMonth, input.correctionReason);
    const { values, isCorrection } = await buildRecord(tx, input);
    const [row] = await tx.update(payrollRecords).set({ ...values, updatedAt: new Date() }).where(eq(payrollRecords.id, id)).returning();
    await audit(tx, ctx, { action: "update", entity: "payroll", entityId: id, summary: `Updated payroll #${id}${correctionNote(prev.isCorrection || isCorrection, input.correctionReason)}`, changes: diff(before, row) });
    return row;
  });
}

export async function recordPayment(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = paymentInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(payrollRecords).where(eq(payrollRecords.id, id));
    if (!before) throw notFound("Payroll record");
    const { isCorrection } = await writableYearFor(tx, before.periodMonth, input.correctionReason);
    const amountPaid = normalizeMoney(input.amountPaid!);
    if (compareMoney(amountPaid, before.netPayable) > 0) throw new AppError("Amount paid cannot exceed net payable.");
    const [row] = await tx
      .update(payrollRecords)
      .set({
        amountPaid,
        paymentStatus: derivePaymentStatus(before.netPayable, amountPaid),
        paymentDate: input.paymentDate ?? before.paymentDate,
        paymentMethod: input.paymentMethod ?? before.paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(payrollRecords.id, id))
      .returning();
    await audit(tx, ctx, { action: "payment", entity: "payroll", entityId: id, summary: `Payroll #${id} paid ₹${amountPaid} of ₹${row.netPayable}${correctionNote(isCorrection, input.correctionReason)}`, changes: diff(before, row) });
    return row;
  });
}

export async function deletePayroll(db: Db, ctx: Ctx, id: number, correctionReason?: string | null) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(payrollRecords).where(eq(payrollRecords.id, id));
    if (!before) throw notFound("Payroll record");
    if (compareMoney(before.amountPaid, "0") > 0) throw conflict("This record has payments. Set the amount paid to 0 first.");
    const { isCorrection } = await writableYearFor(tx, before.periodMonth, correctionReason);
    await tx.delete(payrollRecords).where(eq(payrollRecords.id, id));
    await audit(tx, ctx, { action: "delete", entity: "payroll", entityId: id, summary: `Deleted unpaid payroll ${before.periodMonth.slice(0, 7)} employee #${before.employeeId}${correctionNote(isCorrection, correctionReason)}`, changes: before });
  });
}

/**
 * Creates missing records for every active employee for one month.
 * Days paid come from attendance when available: present/late = 1, half-day = 0.5.
 * Existing records are never overwritten.
 */
export async function generateMonth(db: Db, ctx: Ctx, raw: unknown) {
  const input = generateInput.parse(raw);
  const month = input.periodMonth;
  if (input.useAttendance && lastOfMonth(month) >= todayIso()) {
    throw new AppError(
      `${monthLabel(month)} has not ended yet, so its attendance is incomplete. Generate from attendance after the month ends, or untick “use attendance” to create full-month records now.`,
    );
  }
  return db.transaction(async (tx) => {
    await writableYearFor(tx, month, input.correctionReason);
    const active = await tx
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.status, "active"),
          sql`(${employees.joiningDate} is null or ${employees.joiningDate} <= ${lastOfMonth(month)})`,
          sql`(${employees.exitDate} is null or ${employees.exitDate} >= ${month})`,
        ),
      );
    const existing = await tx
      .select({ employeeId: payrollRecords.employeeId })
      .from(payrollRecords)
      .where(eq(payrollRecords.periodMonth, month));
    const have = new Set(existing.map((e) => e.employeeId));
    const todo = active.filter((e) => !have.has(e.id));

    const attendance = new Map<number, { paid: number; absent: number; marked: number }>();
    if (input.useAttendance && todo.length) {
      const rows = await tx
        .select({
          employeeId: attendanceRecords.employeeId,
          paid: sql<string>`sum(case when ${attendanceRecords.status} = 'present' then 1 when ${attendanceRecords.status} = 'half_day' then 0.5 else 0 end)`,
          absent: sql<string>`sum(case when ${attendanceRecords.status} = 'absent' then 1 when ${attendanceRecords.status} = 'half_day' then 0.5 else 0 end)`,
          marked: countAll,
        })
        .from(attendanceRecords)
        .where(and(inArray(attendanceRecords.employeeId, todo.map((t) => t.id)), gte(attendanceRecords.workDate, month), lte(attendanceRecords.workDate, lastOfMonth(month))))
        .groupBy(attendanceRecords.employeeId);
      for (const r of rows) attendance.set(r.employeeId, { paid: Number(r.paid), absent: Number(r.absent), marked: r.marked });
    }

    const created: number[] = [];
    const skipped: Array<{ employee: string; reason: string }> = [];
    for (const emp of todo) {
      const att = attendance.get(emp.id);
      const daysPaid = att ? String(att.paid) : emp.payType === "daily" ? null : null;
      if (emp.payType === "daily" && daysPaid === null) {
        skipped.push({ employee: emp.name, reason: "Daily-paid with no attendance for this month" });
        continue;
      }
      if (!(emp.payType === "daily" ? emp.dailyRate : emp.monthlySalary)) {
        skipped.push({ employee: emp.name, reason: "No salary/rate configured" });
        continue;
      }
      try {
        const { values } = await buildRecord(tx, payrollInput.parse({ employeeId: emp.id, periodMonth: month, daysPaid, absentDays: att ? String(att.absent) : null, correctionReason: input.correctionReason }));
        const [row] = await tx.insert(payrollRecords).values(values).onConflictDoNothing().returning({ id: payrollRecords.id });
        if (row) created.push(row.id);
      } catch (e) {
        skipped.push({ employee: emp.name, reason: (e as Error).message });
      }
    }
    await audit(tx, ctx, { action: "generate", entity: "payroll", entityId: month, summary: `Generated payroll for ${month.slice(0, 7)}: ${created.length} created, ${have.size} already existed, ${skipped.length} skipped` });
    return { created: created.length, existing: have.size, skipped };
  });
}

const payrollColumns = {
  id: payrollRecords.id,
  employeeId: payrollRecords.employeeId,
  employeeName: employees.name,
  employeeCode: employees.employeeCode,
  periodMonth: payrollRecords.periodMonth,
  payType: payrollRecords.payType,
  baseSalary: payrollRecords.baseSalary,
  workingDays: payrollRecords.workingDays,
  daysPaid: payrollRecords.daysPaid,
  absentDays: payrollRecords.absentDays,
  earnedSalary: payrollRecords.earnedSalary,
  allowances: payrollRecords.allowances,
  deductions: payrollRecords.deductions,
  advance: payrollRecords.advance,
  attendanceAdjustment: payrollRecords.attendanceAdjustment,
  grossSalary: payrollRecords.grossSalary,
  netPayable: payrollRecords.netPayable,
  amountPaid: payrollRecords.amountPaid,
  outstanding: sql<string>`(${payrollRecords.netPayable} - ${payrollRecords.amountPaid})`,
  paymentStatus: payrollRecords.paymentStatus,
  paymentDate: payrollRecords.paymentDate,
  paymentMethod: payrollRecords.paymentMethod,
  notes: payrollRecords.notes,
  yearLabel: financialYears.label,
};

function payrollWhere(q: z.infer<typeof payrollListQuery>) {
  return and(
    q.fy ? eq(payrollRecords.financialYearId, q.fy) : undefined,
    q.employeeId ? eq(payrollRecords.employeeId, q.employeeId) : undefined,
    q.month ? eq(payrollRecords.periodMonth, `${q.month}-01`) : undefined,
    q.paymentStatus ? eq(payrollRecords.paymentStatus, q.paymentStatus) : undefined,
    q.from ? gte(payrollRecords.periodMonth, firstOfMonth(q.from)) : undefined,
    q.to ? lte(payrollRecords.periodMonth, q.to) : undefined,
    search(q.q, [employees.name, employees.employeeCode]),
  );
}

export async function listPayroll(db: Db, raw: unknown) {
  const q = payrollListQuery.parse(raw);
  const where = payrollWhere(q);
  const sortable = { month: payrollRecords.periodMonth, employee: employees.name, net: payrollRecords.netPayable, status: payrollRecords.paymentStatus };
  const base = db
    .select(payrollColumns)
    .from(payrollRecords)
    .innerJoin(employees, eq(employees.id, payrollRecords.employeeId))
    .innerJoin(financialYears, eq(financialYears.id, payrollRecords.financialYearId));
  const [rows, [summary]] = await Promise.all([
    base.where(where).orderBy(...orderBy(sortable, q, [desc(payrollRecords.periodMonth), asc(employees.name)])).limit(q.pageSize).offset(offset(q)),
    db
      .select({
        total: countAll,
        gross: sql<string>`coalesce(sum(${payrollRecords.grossSalary}),0)`,
        net: sql<string>`coalesce(sum(${payrollRecords.netPayable}),0)`,
        paid: sql<string>`coalesce(sum(${payrollRecords.amountPaid}),0)`,
        advance: sql<string>`coalesce(sum(${payrollRecords.advance}),0)`,
      })
      .from(payrollRecords)
      .innerJoin(employees, eq(employees.id, payrollRecords.employeeId))
      .where(where),
  ]);
  return { ...pageOf(rows, summary.total, q), summary };
}

export async function exportPayroll(db: Db, raw: unknown) {
  const q = payrollListQuery.parse({ ...(raw as object), page: 1, pageSize: 200 });
  return db
    .select(payrollColumns)
    .from(payrollRecords)
    .innerJoin(employees, eq(employees.id, payrollRecords.employeeId))
    .innerJoin(financialYears, eq(financialYears.id, payrollRecords.financialYearId))
    .where(payrollWhere(q))
    .orderBy(desc(payrollRecords.periodMonth), asc(employees.name))
    .limit(50_000);
}

export const annualQuery = z.object({
  mode: z.enum(["calendar", "fy"]).default("fy"),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  fy: z.coerce.number().int().positive().optional(),
  metric: z.enum(["net", "paid", "gross"]).default("net"),
});

/** Excel-like employee × month grid, built from normalized monthly rows. */
export async function annualGrid(db: Db, raw: unknown) {
  const q = annualQuery.parse(raw);
  let start: string;
  let end: string;
  let title: string;
  if (q.mode === "fy") {
    let fyRow;
    if (q.fy) fyRow = await getYear(db, q.fy);
    else [fyRow] = await db.select().from(financialYears).orderBy(desc(financialYears.startDate)).limit(1);
    if (!fyRow) return { title: "No financial years yet", months: [], rows: [], totals: {} as Record<string, string>, grandTotal: "0.00" };
    start = fyRow.startDate;
    end = fyRow.endDate;
    title = fyRow.label;
  } else {
    const y = q.year ?? new Date().getFullYear();
    start = `${y}-01-01`;
    end = `${y}-12-31`;
    title = `Calendar ${y}`;
  }
  const months = monthsBetween(start, end);
  const metricCol = q.metric === "paid" ? payrollRecords.amountPaid : q.metric === "gross" ? payrollRecords.grossSalary : payrollRecords.netPayable;
  const rows = await db
    .select({
      id: payrollRecords.id,
      employeeId: employees.id,
      name: employees.name,
      code: employees.employeeCode,
      month: payrollRecords.periodMonth,
      value: metricCol,
      status: payrollRecords.paymentStatus,
    })
    .from(payrollRecords)
    .innerJoin(employees, eq(employees.id, payrollRecords.employeeId))
    .where(and(gte(payrollRecords.periodMonth, months[0]), lte(payrollRecords.periodMonth, months[months.length - 1])))
    .orderBy(asc(employees.name));

  const byEmp = new Map<number, { employeeId: number; name: string; code: string; cells: Record<string, { id: number; value: string; status: string }>; total: bigint }>();
  const colTotals = new Map<string, bigint>();
  let grand = BigInt(0);
  const { toPaise, fromPaise } = await import("../money");
  for (const r of rows) {
    const e = byEmp.get(r.employeeId) ?? { employeeId: r.employeeId, name: r.name, code: r.code, cells: {}, total: BigInt(0) };
    e.cells[r.month] = { id: r.id, value: r.value, status: r.status };
    const p = toPaise(r.value);
    e.total += p;
    colTotals.set(r.month, (colTotals.get(r.month) ?? BigInt(0)) + p);
    grand += p;
    byEmp.set(r.employeeId, e);
  }
  return {
    title,
    metric: q.metric,
    months,
    rows: [...byEmp.values()].map((e) => ({ ...e, total: fromPaise(e.total) })),
    totals: Object.fromEntries(months.map((m) => [m, fromPaise(colTotals.get(m) ?? BigInt(0))])),
    grandTotal: fromPaise(grand),
  };
}
