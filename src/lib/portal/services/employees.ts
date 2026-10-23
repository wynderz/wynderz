import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeKey } from "../attendance-engine";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { employees } from "../db/schema";
import { conflict, notFound } from "../errors";
import { listQuery, optDate, optMoney, optText, reqText } from "../validation";
import { countAll, offset, orderBy, pageOf, search } from "./shared";

/** Employees are records only — they never receive portal logins. */
export const employeeInput = z
  .object({
    employeeCode: optText(30),
    deviceUserId: optText(40),
    name: reqText(160),
    department: optText(80),
    designation: optText(80),
    joiningDate: optDate,
    exitDate: optDate,
    status: z.enum(["active", "inactive"]).default("active"),
    phone: optText(40),
    email: optText(200).refine((v) => v === null || z.string().email().safeParse(v).success, "Invalid email"),
    address: optText(500),
    payType: z.enum(["monthly", "daily"]).default("monthly"),
    monthlySalary: optMoney,
    dailyRate: optMoney,
    notes: optText(2000),
  })
  .refine((v) => !v.joiningDate || !v.exitDate || v.exitDate >= v.joiningDate, { message: "Exit date must be after joining date", path: ["exitDate"] })
  .refine((v) => v.payType !== "daily" || v.dailyRate !== null, { message: "Daily-paid employees need a daily rate", path: ["dailyRate"] });

export const employeeListQuery = listQuery.extend({
  status: z.enum(["active", "inactive"]).optional(),
  department: z.string().trim().max(80).optional(),
});

async function nextCode(db: Tx) {
  // numeric, not int: a long custom code such as EMP-99999999999 must not break auto-numbering.
  const res = await db.execute<{ n: string }>(
    sql`select (coalesce(max(nullif(regexp_replace(employee_code, '\\D', '', 'g'), '')::numeric), 0) + 1)::text as n from employees where employee_code ~* '^EMP-\\d+$'`,
  );
  return `EMP-${String(res.rows[0]?.n ?? 1).padStart(3, "0")}`;
}

/**
 * Attendance/timesheet imports match device IDs and codes after normalizeKey (case, whitespace,
 * leading zeros). The DB unique indexes compare raw values, so "0201" and "201" would both be
 * accepted and every later import row for either employee would be rejected as ambiguous.
 */
async function assertMatchKeysUnique(tx: Tx, keys: { employeeCode: string; deviceUserId: string | null }, selfId?: number) {
  const rows = await tx.select({ id: employees.id, employeeCode: employees.employeeCode, deviceUserId: employees.deviceUserId }).from(employees);
  const code = normalizeKey(keys.employeeCode);
  const device = keys.deviceUserId ? normalizeKey(keys.deviceUserId) : null;
  for (const r of rows) {
    if (r.id === selfId) continue;
    if (normalizeKey(r.employeeCode) === code) throw conflict("An employee with this ID already exists.");
    if (device && r.deviceUserId && normalizeKey(r.deviceUserId) === device) throw conflict("Another employee already uses this biometric device ID.");
  }
}

export async function listEmployees(db: Db, raw: unknown) {
  const q = employeeListQuery.parse(raw);
  const where = and(
    q.status ? eq(employees.status, q.status) : undefined,
    q.department ? eq(employees.department, q.department) : undefined,
    search(q.q, [employees.name, employees.employeeCode, employees.deviceUserId, employees.department, employees.designation, employees.phone]),
  );
  const sortable = { name: employees.name, code: employees.employeeCode, department: employees.department, joiningDate: employees.joiningDate };
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(employees).where(where).orderBy(...orderBy(sortable, q, [asc(employees.name)])).limit(q.pageSize).offset(offset(q)),
    db.select({ total: countAll }).from(employees).where(where),
  ]);
  return pageOf(rows, total, q);
}

export async function employeeOptions(db: Tx, activeOnly = false) {
  return db
    .select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, status: employees.status })
    .from(employees)
    .where(activeOnly ? eq(employees.status, "active") : undefined)
    .orderBy(asc(employees.name));
}

export async function departments(db: Tx) {
  const rows = await db.selectDistinct({ d: employees.department }).from(employees).where(sql`${employees.department} is not null`).orderBy(employees.department);
  return rows.map((r) => r.d as string);
}

export async function getEmployee(db: Tx, id: number) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id));
  if (!row) throw notFound("Employee");
  return row;
}

export async function createEmployee(db: Db, ctx: Ctx, raw: unknown) {
  const input = employeeInput.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242004)`);
    const employeeCode = input.employeeCode || (await nextCode(tx));
    await assertMatchKeysUnique(tx, { employeeCode, deviceUserId: input.deviceUserId });
    const [row] = await tx.insert(employees).values({ ...input, employeeCode }).returning();
    await audit(tx, ctx, { action: "create", entity: "employee", entityId: row.id, summary: `Added employee ${row.employeeCode} · ${row.name}` });
    return row;
  });
}

export async function updateEmployee(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = employeeInput.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242004)`);
    const before = await getEmployee(tx, id);
    const employeeCode = input.employeeCode || before.employeeCode;
    await assertMatchKeysUnique(tx, { employeeCode, deviceUserId: input.deviceUserId }, id);
    const [row] = await tx
      .update(employees)
      .set({ ...input, employeeCode, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    await audit(tx, ctx, { action: "update", entity: "employee", entityId: id, summary: `Updated employee ${row.employeeCode}`, changes: diff(before, row) });
    return row;
  });
}
