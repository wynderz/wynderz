import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { buildEmployeeIndex, normalizeKey } from "../attendance-engine";
import { audit, diff, type Ctx } from "../audit";
import { computeWorkedMinutes, isIsoDate } from "../dates";
import type { Db, Tx } from "../db";
import { documents, employees, importJobs, projects, timesheets } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { cellToString, parseDateCell, parseTimeCell, readSpreadsheet, type DateOrder } from "../spreadsheet";
import { getStorage } from "../storage";
import { correction, isoDate, listQuery, optId, optText, reqText } from "../validation";
import { saveMapping } from "./attendance";
import { assertDateWritable, countAll, offset, orderBy, pageOf, search } from "./shared";

const hhmm = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ? v.slice(0, 5) : null))
  .refine((v) => v === null || /^\d{2}:\d{2}$/.test(v), "Use HH:MM");

export const timesheetInput = z
  .object({
    employeeId: z.coerce.number().int().positive(),
    projectId: optId,
    workDate: isoDate,
    task: reqText(500),
    startTime: hhmm,
    endTime: hhmm,
    breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
    /** Used only when start/end are not given. */
    hours: z
      .union([z.string(), z.number(), z.null(), z.undefined()])
      .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
      .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v <= 24), "Hours must be between 0 and 24"),
    status: z.enum(["draft", "submitted", "approved", "rejected"]).default("submitted"),
    notes: optText(2000),
    ...correction,
  })
  .refine((v) => (v.startTime && v.endTime) || v.hours !== null, { message: "Enter start and end times, or total hours", path: ["startTime"] })
  .refine((v) => !!v.startTime === !!v.endTime, { message: "Enter both start and end times", path: ["endTime"] });

export const timesheetListQuery = listQuery.extend({
  employeeId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
});

/** Overtime is not computed: the company has no documented overtime policy. */
export function timesheetMinutes(v: { startTime: string | null; endTime: string | null; breakMinutes: number; hours: number | null }) {
  if (v.startTime && v.endTime) return computeWorkedMinutes(v.startTime, v.endTime, v.breakMinutes);
  return Math.round((v.hours ?? 0) * 60);
}

async function checkRefs(tx: Tx, employeeId: number, projectId: number | null) {
  const [e] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
  if (!e) throw new AppError("Choose a valid employee.");
  if (projectId) {
    const [p] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!p) throw new AppError("Choose a valid project.");
  }
}

function values(input: z.infer<typeof timesheetInput>) {
  let totalMinutes: number;
  try {
    totalMinutes = timesheetMinutes(input);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  const { correctionReason: _c, hours: _h, ...rest } = input;
  void _c;
  void _h;
  return { ...rest, totalMinutes };
}

export async function createTimesheet(db: Db, ctx: Ctx, raw: unknown) {
  const input = timesheetInput.parse(raw);
  return db.transaction(async (tx) => {
    await checkRefs(tx, input.employeeId, input.projectId);
    await assertDateWritable(tx, input.workDate, input.correctionReason);
    const [row] = await tx.insert(timesheets).values(values(input)).returning();
    await audit(tx, ctx, { action: "create", entity: "timesheet", entityId: row.id, summary: `Timesheet ${row.workDate} employee #${row.employeeId}: ${(row.totalMinutes / 60).toFixed(2)} h` });
    return row;
  });
}

export async function updateTimesheet(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = timesheetInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(timesheets).where(eq(timesheets.id, id));
    if (!before) throw notFound("Timesheet");
    await assertDateWritable(tx, before.workDate, input.correctionReason);
    await assertDateWritable(tx, input.workDate, input.correctionReason);
    await checkRefs(tx, input.employeeId, input.projectId);
    const [row] = await tx.update(timesheets).set({ ...values(input), updatedAt: new Date() }).where(eq(timesheets.id, id)).returning();
    await audit(tx, ctx, { action: "update", entity: "timesheet", entityId: id, summary: `Updated timesheet #${id}`, changes: diff(before, row) });
    return row;
  });
}

export async function deleteTimesheet(db: Db, ctx: Ctx, id: number, correctionReason?: string | null) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(timesheets).where(eq(timesheets.id, id));
    if (!before) throw notFound("Timesheet");
    await assertDateWritable(tx, before.workDate, correctionReason);
    await tx.delete(timesheets).where(eq(timesheets.id, id));
    await audit(tx, ctx, { action: "delete", entity: "timesheet", entityId: id, summary: `Deleted timesheet ${before.workDate} employee #${before.employeeId}`, changes: before });
  });
}

function tsWhere(q: z.infer<typeof timesheetListQuery>, fyRange?: { start: string; end: string }) {
  return and(
    q.employeeId ? eq(timesheets.employeeId, q.employeeId) : undefined,
    q.projectId ? eq(timesheets.projectId, q.projectId) : undefined,
    q.status ? eq(timesheets.status, q.status) : undefined,
    q.from ? gte(timesheets.workDate, q.from) : undefined,
    q.to ? lte(timesheets.workDate, q.to) : undefined,
    fyRange ? and(gte(timesheets.workDate, fyRange.start), lte(timesheets.workDate, fyRange.end)) : undefined,
    search(q.q, [timesheets.task, employees.name, projects.code, projects.name]),
  );
}

const tsColumns = {
  id: timesheets.id,
  employeeId: timesheets.employeeId,
  employeeName: employees.name,
  employeeCode: employees.employeeCode,
  projectId: timesheets.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  workDate: timesheets.workDate,
  task: timesheets.task,
  startTime: timesheets.startTime,
  endTime: timesheets.endTime,
  breakMinutes: timesheets.breakMinutes,
  totalMinutes: timesheets.totalMinutes,
  status: timesheets.status,
  source: timesheets.source,
  notes: timesheets.notes,
};

async function fyRangeOf(db: Tx, fy?: number) {
  if (!fy) return undefined;
  const res = await db.execute<{ start: string; end: string }>(sql`select start_date::text as start, end_date::text as end from financial_years where id = ${fy}`);
  return res.rows[0];
}

export async function listTimesheets(db: Db, raw: unknown) {
  const q = timesheetListQuery.parse(raw);
  const where = tsWhere(q, await fyRangeOf(db, q.fy));
  const sortable = { date: timesheets.workDate, employee: employees.name, project: projects.code, hours: timesheets.totalMinutes };
  const [rows, [summary]] = await Promise.all([
    db.select(tsColumns).from(timesheets).innerJoin(employees, eq(employees.id, timesheets.employeeId)).leftJoin(projects, eq(projects.id, timesheets.projectId)).where(where).orderBy(...orderBy(sortable, q, [desc(timesheets.workDate), asc(employees.name)])).limit(q.pageSize).offset(offset(q)),
    db.select({ total: countAll, minutes: sql<number>`coalesce(sum(${timesheets.totalMinutes}),0)::int` }).from(timesheets).innerJoin(employees, eq(employees.id, timesheets.employeeId)).leftJoin(projects, eq(projects.id, timesheets.projectId)).where(where),
  ]);
  return { ...pageOf(rows, summary.total, q), summary };
}

export async function exportTimesheets(db: Db, raw: unknown) {
  const q = timesheetListQuery.parse({ ...(raw as object), page: 1, pageSize: 200 });
  return db.select(tsColumns).from(timesheets).innerJoin(employees, eq(employees.id, timesheets.employeeId)).leftJoin(projects, eq(projects.id, timesheets.projectId)).where(tsWhere(q, await fyRangeOf(db, q.fy))).orderBy(desc(timesheets.workDate)).limit(50_000);
}

/** Grouped hours: by project, employee or month. */
export async function timesheetSummary(db: Db, raw: unknown, groupBy: "project" | "employee" | "month") {
  const q = timesheetListQuery.parse(raw);
  const where = tsWhere(q, await fyRangeOf(db, q.fy));
  const key =
    groupBy === "project"
      ? sql<string>`coalesce(${projects.code} || ' · ' || ${projects.name}, 'No project')`
      : groupBy === "employee"
        ? sql<string>`${employees.name}`
        : sql<string>`to_char(date_trunc('month', ${timesheets.workDate}), 'YYYY-MM')`;
  return db
    .select({ key, minutes: sql<number>`sum(${timesheets.totalMinutes})::int`, entries: countAll, people: sql<number>`count(distinct ${timesheets.employeeId})::int` })
    .from(timesheets)
    .innerJoin(employees, eq(employees.id, timesheets.employeeId))
    .leftJoin(projects, eq(projects.id, timesheets.projectId))
    .where(where)
    .groupBy(sql`1`)
    .orderBy(groupBy === "month" ? sql`1` : desc(sql`2`));
}

/* ------------------------------------------------------------------ import */

const col = z.union([z.number().int().min(0).max(500), z.null()]).optional();
export const timesheetMappingSchema = z
  .object({
    sheet: z.string().min(1),
    headerRow: z.number().int().min(1).max(50),
    employeeMatch: z.enum(["device_user_id", "employee_code", "name"]),
    dateOrder: z.enum(["auto", "DMY", "MDY", "YMD"]).default("auto"),
    columns: z.object({ employee: z.number().int().min(0), date: z.number().int().min(0), project: col, task: col, start: col, end: col, break: col, hours: col }),
  })
  .refine((m) => (m.columns.start != null && m.columns.end != null) || m.columns.hours != null, { message: "Map start + end columns, or an hours column", path: ["columns", "hours"] });

async function parseTimesheetFile(db: Tx, jobId: number, raw: unknown) {
  const mapping = timesheetMappingSchema.parse(raw);
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
  if (!job || job.type !== "timesheet") throw notFound("Timesheet import");
  const [doc] = job.documentId ? await db.select().from(documents).where(eq(documents.id, job.documentId)) : [];
  if (!doc) throw new AppError("The uploaded file for this import is missing.");
  const sheets = await readSpreadsheet(doc.originalName, await getStorage().get(doc.storageKey));
  const sheet = sheets.find((s) => s.name === mapping.sheet);
  if (!sheet) throw new AppError(`Sheet "${mapping.sheet}" not found.`);
  const emps = await db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, deviceUserId: employees.deviceUserId }).from(employees);
  const index = buildEmployeeIndex(emps, mapping.employeeMatch);
  const projs = await db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects);
  const projIndex = new Map<string, number>();
  for (const p of projs) {
    projIndex.set(normalizeKey(p.code), p.id);
    projIndex.set(normalizeKey(p.name), p.id);
  }
  const c = mapping.columns;
  const rows: Array<z.input<typeof timesheetInput> & { row: number }> = [];
  const issues: Array<{ row: number; level: "error" | "warning"; message: string }> = [];
  const unmatched = new Map<string, number>();
  sheet.rows.slice(mapping.headerRow).forEach((r, i) => {
    const rowNo = mapping.headerRow + i + 1;
    if (!r || r.every((v) => v === null)) return;
    const get = (idx?: number | null) => (idx == null ? null : (r[idx] ?? null));
    const key = cellToString(get(c.employee));
    const emp = key ? index.get(normalizeKey(key)) : undefined;
    if (!emp) {
      if (key) unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
      else issues.push({ row: rowNo, level: "error", message: "Missing employee" });
      return;
    }
    if (emp.length > 1) return issues.push({ row: rowNo, level: "error", message: `"${key}" matches several employees` });
    const date = parseDateCell(get(c.date), mapping.dateOrder as DateOrder);
    if (!date) return issues.push({ row: rowNo, level: "error", message: "Invalid date" });
    const projKey = cellToString(get(c.project));
    const projectId = projKey ? projIndex.get(normalizeKey(projKey)) : undefined;
    if (projKey && !projectId) issues.push({ row: rowNo, level: "warning", message: `Project "${projKey}" not found — saved without project` });
    const start = parseTimeCell(get(c.start));
    const end = parseTimeCell(get(c.end));
    const fmt = (m: number | null) => (m === null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    const hoursCell = get(c.hours);
    const candidate = {
      row: rowNo,
      employeeId: emp[0].id,
      projectId: projectId ?? null,
      workDate: date,
      task: cellToString(get(c.task)) || "Work",
      startTime: fmt(start),
      endTime: fmt(end),
      breakMinutes: Number(cellToString(get(c.break)) || 0),
      hours: hoursCell === null ? null : typeof hoursCell === "number" && hoursCell < 1 && hoursCell > 0 ? hoursCell * 24 : Number(cellToString(hoursCell)),
      status: "submitted" as const,
    };
    const parsed = timesheetInput.safeParse(candidate);
    if (!parsed.success) return issues.push({ row: rowNo, level: "error", message: parsed.error.issues[0].message });
    try {
      timesheetMinutes(parsed.data);
    } catch (e) {
      return issues.push({ row: rowNo, level: "error", message: (e as Error).message });
    }
    rows.push(candidate);
  });
  const unmatchedRows = [...unmatched.values()].reduce((a, b) => a + b, 0);
  return { mapping, rows, issues, unmatchedRows, unmatched: [...unmatched.entries()].map(([key, n]) => ({ key, rows: n })) };
}

export async function previewTimesheetImport(db: Db, jobId: number, raw: unknown) {
  const { rows, issues, unmatched } = await parseTimesheetFile(db, jobId, raw);
  return {
    validRows: rows.length,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    issues: issues.slice(0, 300),
    unmatched,
    sample: rows.slice(0, 40),
  };
}

export async function commitTimesheetImport(db: Db, ctx: Ctx, jobId: number, raw: { mapping?: unknown; saveMappingName?: string | null; correctionReason?: string | null }) {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(importJobs).where(eq(importJobs.id, jobId)).for("update");
    if (!job) throw notFound("Import");
    if (job.status === "completed") throw conflict("This import was already completed.");
    const { mapping, rows, issues, unmatched, unmatchedRows } = await parseTimesheetFile(tx, jobId, raw.mapping);
    let inserted = 0;
    let duplicates = 0;
    for (const r of rows) {
      const v = values(timesheetInput.parse(r));
      if (!isIsoDate(v.workDate)) continue;
      await assertDateWritable(tx, v.workDate, raw.correctionReason);
      // Idempotent: identical entries are skipped.
      const [dup] = await tx
        .select({ id: timesheets.id })
        .from(timesheets)
        .where(
          and(
            eq(timesheets.employeeId, v.employeeId),
            eq(timesheets.workDate, v.workDate),
            eq(timesheets.task, v.task),
            eq(timesheets.totalMinutes, v.totalMinutes),
            v.projectId ? eq(timesheets.projectId, v.projectId) : sql`${timesheets.projectId} is null`,
            v.startTime ? eq(timesheets.startTime, v.startTime) : sql`${timesheets.startTime} is null`,
          ),
        )
        .limit(1);
      if (dup) {
        duplicates++;
        continue;
      }
      await tx.insert(timesheets).values({ ...v, source: "import", importJobId: jobId });
      inserted++;
    }
    if (raw.saveMappingName) await saveMapping(tx, "timesheet", raw.saveMappingName, mapping);
    const errorRows = issues.filter((i) => i.level === "error").length;
    const [done] = await tx
      .update(importJobs)
      .set({ status: "completed", mappingConfig: mapping, totalRows: rows.length + errorRows + unmatchedRows, importedRows: inserted, skippedRows: duplicates + unmatchedRows, errorRows, issues: { issues: issues.slice(0, 1000), unmatched }, completedAt: new Date() })
      .where(eq(importJobs.id, jobId))
      .returning();
    await audit(tx, ctx, { action: "import", entity: "timesheet", entityId: jobId, summary: `Timesheet import ${done.fileName}: ${inserted} added, ${duplicates} duplicates skipped, ${errorRows} errors` });
    return { inserted, duplicates, errorRows, unmatched };
  });
}
