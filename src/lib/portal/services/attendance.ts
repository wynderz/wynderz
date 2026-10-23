import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  parseAttendanceRows,
  suggestMapping,
  summarizeDay,
  type AttendanceMapping,
  type DailyRecord,
} from "../attendance-engine";
import { audit, type Ctx } from "../audit";
import { addDays, computeWorkedMinutes, isIsoDate, timeToMinutes } from "../dates";
import type { Db, Tx } from "../db";
import { attendancePunches, attendanceRecords, documents, employees, financialYears, importJobs, importMappings } from "../db/schema";
import { AppError, conflict, notFound } from "../errors";
import { guessHeaderRow, headersOf, readSpreadsheet, cellToString, type Sheet } from "../spreadsheet";
import { getStorage, maxUploadBytes, storeBytes } from "../storage";
import { isoDate, optText, correction } from "../validation";
import { getSetting } from "./settings";
import { assertYearWritable, countAll } from "./shared";

export const ATTENDANCE_STATUSES = ["present", "absent", "half_day", "leave", "missing_punch", "holiday", "weekly_off"] as const;

const colIdx = z.union([z.number().int().min(0).max(500), z.null()]).optional();

export const mappingSchema = z
  .object({
    sheet: z.string().min(1),
    headerRow: z.number().int().min(1).max(50),
    layout: z.enum(["punches", "daily"]),
    employeeMatch: z.enum(["device_user_id", "employee_code", "name"]),
    dateOrder: z.enum(["auto", "DMY", "MDY", "YMD"]).default("auto"),
    columns: z.object({
      employee: z.number().int().min(0).max(500),
      dateTime: colIdx,
      date: colIdx,
      time: colIdx,
      inTime: colIdx,
      outTime: colIdx,
      status: colIdx,
      deviceId: colIdx,
    }),
  })
  .superRefine((m, ctx) => {
    const c = m.columns;
    if (m.layout === "punches" && c.dateTime == null && (c.date == null || c.time == null)) {
      ctx.addIssue({ code: "custom", path: ["columns", "dateTime"], message: "Map a date-time column, or both a date and a time column" });
    }
    if (m.layout === "daily" && c.date == null) {
      ctx.addIssue({ code: "custom", path: ["columns", "date"], message: "Map the date column" });
    }
    if (m.layout === "daily" && c.inTime == null && c.outTime == null && c.status == null) {
      ctx.addIssue({ code: "custom", path: ["columns", "inTime"], message: "Map in/out times or a status column" });
    }
  });

export const commitSchema = z.object({
  mapping: mappingSchema,
  markAbsent: z.boolean().default(false),
  saveMappingName: optText(80),
  ...correction,
});

async function policy(db: Tx) {
  return getSetting(db, "attendance");
}

async function loadSheets(db: Tx, jobId: number) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
  if (!job) throw notFound("Import");
  if (!job.documentId) throw new AppError("The uploaded file for this import is missing.");
  const [doc] = await db.select().from(documents).where(eq(documents.id, job.documentId));
  if (!doc) throw new AppError("The uploaded file for this import is missing.");
  const bytes = await getStorage().get(doc.storageKey);
  const sheets = await readSpreadsheet(doc.originalName, bytes);
  return { job, sheets };
}

function sheetSummary(sheets: Sheet[]) {
  return sheets.map((s) => {
    const headerRow = guessHeaderRow(s);
    const headers = headersOf(s, headerRow);
    return {
      name: s.name,
      rowCount: s.rows.length,
      headerRow,
      headers,
      sample: s.rows.slice(0, headerRow + 8).map((r) => (r ?? []).slice(0, headers.length).map(cellToString)),
      suggested: suggestMapping(headers),
    };
  });
}

/** Step 1: store the upload privately and describe its sheets/columns. */
export async function startImport(db: Db, ctx: Ctx, file: File, type: "attendance" | "timesheet" = "attendance") {
  const { maxMb } = await getSetting(db, "uploads");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sheets = await readSpreadsheet(file.name, bytes); // validates before storing
  if (!sheets.some((s) => s.rows.length > 1)) throw new AppError("The file has no data rows.");
  const stored = await storeBytes(file.name, bytes, maxUploadBytes(maxMb));
  try {
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          title: `${type === "attendance" ? "Attendance" : "Timesheet"} import · ${stored.originalName}`,
          docType: type === "attendance" ? "attendance_upload" : "other",
          originalName: stored.originalName,
          storageKey: stored.key,
          mimeType: stored.mime,
          sizeBytes: stored.size,
          sha256: stored.sha256,
          uploadedBy: ctx.userId,
        })
        .returning();
      const [previous] = await tx
        .select({ id: importJobs.id, createdAt: importJobs.createdAt })
        .from(importJobs)
        .where(and(eq(importJobs.type, type), eq(importJobs.fileHash, stored.sha256), eq(importJobs.status, "completed")))
        .orderBy(desc(importJobs.createdAt))
        .limit(1);
      const [job] = await tx
        .insert(importJobs)
        .values({ type, fileName: stored.originalName, fileHash: stored.sha256, documentId: doc.id, createdBy: ctx.userId })
        .returning();
      await audit(tx, ctx, { action: "upload", entity: "import", entityId: job.id, summary: `Uploaded ${type} file ${stored.originalName}` });
      return { job, previous };
    });
    const saved = await db.select().from(importMappings).where(eq(importMappings.type, type)).orderBy(asc(importMappings.name));
    return {
      jobId: result.job.id,
      fileName: result.job.fileName,
      previousImport: result.previous ?? null,
      sheets: sheetSummary(sheets),
      savedMappings: saved,
    };
  } catch (e) {
    await getStorage().remove(stored.key).catch(() => {});
    throw e;
  }
}

async function analyse(db: Tx, jobId: number, mapping: AttendanceMapping) {
  const { job, sheets } = await loadSheets(db, jobId);
  if (job.type !== "attendance") throw new AppError("This is not an attendance import.");
  const sheet = sheets.find((s) => s.name === mapping.sheet);
  if (!sheet) throw new AppError(`Sheet "${mapping.sheet}" not found in the file.`);
  const emps = await db
    .select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, deviceUserId: employees.deviceUserId })
    .from(employees);
  const pol = await policy(db);
  const parsed = parseAttendanceRows(sheet.rows, mapping, emps, pol);
  return { job, parsed, emps, pol };
}

/** Step 2: validate with a mapping. Nothing is written. */
export async function previewImport(db: Db, jobId: number, rawMapping: unknown) {
  const mapping = mappingSchema.parse(rawMapping) as AttendanceMapping;
  const { parsed, emps } = await analyse(db, jobId, mapping);
  const names = new Map(emps.map((e) => [e.id, e.name]));

  let alreadyImported = 0;
  let manualKept = 0;
  if (parsed.period.start && parsed.period.end) {
    const empIds = [...new Set(parsed.daily.map((d) => d.employeeId))];
    if (empIds.length) {
      if (parsed.punches.length) {
        const existing = await db
          .select({ employeeId: attendancePunches.employeeId, punchedAt: attendancePunches.punchedAt })
          .from(attendancePunches)
          .where(and(inArray(attendancePunches.employeeId, empIds), gte(attendancePunches.workDate, parsed.period.start), lte(attendancePunches.workDate, parsed.period.end)));
        const set = new Set(existing.map((e) => `${e.employeeId}|${e.punchedAt.slice(0, 19)}`));
        alreadyImported = parsed.punches.filter((p) => set.has(`${p.employeeId}|${p.punchedAt}`)).length;
      }
      const manual = await db
        .select({ employeeId: attendanceRecords.employeeId, workDate: attendanceRecords.workDate })
        .from(attendanceRecords)
        .where(and(inArray(attendanceRecords.employeeId, empIds), eq(attendanceRecords.source, "manual"), gte(attendanceRecords.workDate, parsed.period.start), lte(attendanceRecords.workDate, parsed.period.end)));
      const mset = new Set(manual.map((m) => `${m.employeeId}|${m.workDate}`));
      manualKept = parsed.daily.filter((d) => mset.has(`${d.employeeId}|${d.workDate}`)).length;
    }
  }
  const closedYears = await yearsBlocking(db, parsed.period.start, parsed.period.end);
  const statusCounts: Record<string, number> = {};
  for (const d of parsed.daily) statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;

  return {
    totalRows: parsed.totalRows,
    skippedRows: parsed.skippedRows,
    validPunches: parsed.punches.length,
    dailyRecords: parsed.daily.length,
    inFileDuplicates: parsed.inFileDuplicates,
    alreadyImported,
    manualKept,
    period: parsed.period,
    statusCounts,
    errors: parsed.issues.filter((i) => i.level === "error").length,
    warnings: parsed.issues.filter((i) => i.level === "warning").length,
    issues: parsed.issues.slice(0, 300),
    unmatched: [...parsed.unmatched.entries()].map(([key, rows]) => ({ key, rows })).sort((a, b) => b.rows - a.rows),
    ambiguous: [...parsed.ambiguous],
    closedYears,
    sample: parsed.daily
      .sort((a, b) => (a.workDate === b.workDate ? a.employeeId - b.employeeId : a.workDate < b.workDate ? -1 : 1))
      .slice(0, 60)
      .map((d) => ({ ...d, employeeName: names.get(d.employeeId) ?? "" })),
  };
}

async function yearsBlocking(db: Tx, start: string | null, end: string | null) {
  if (!start || !end) return [];
  const rows = await db
    .select({ label: financialYears.label, status: financialYears.status })
    .from(financialYears)
    .where(and(lte(financialYears.startDate, end), gte(financialYears.endDate, start), ne(financialYears.status, "open")));
  return rows;
}

const CHUNK = 1000;

/** Step 3: write validated rows. Idempotent: re-importing the same export changes nothing. */
export async function commitImport(db: Db, ctx: Ctx, jobId: number, raw: unknown) {
  const input = commitSchema.parse(raw);
  const mapping = input.mapping as AttendanceMapping;
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(importJobs).where(eq(importJobs.id, jobId)).for("update");
    if (!locked) throw notFound("Import");
    if (locked.status === "completed") throw conflict("This import was already completed. Upload the file again to re-import.");
    const { parsed, pol } = await analyse(tx, jobId, mapping);
    if (!parsed.daily.length) throw new AppError("No valid attendance rows to import. Check the column mapping and employee matching.");

    for (const y of await yearsBlocking(tx, parsed.period.start, parsed.period.end)) {
      assertYearWritable({ label: y.label, status: y.status } as Parameters<typeof assertYearWritable>[0], input.correctionReason);
    }

    // 1) Raw punches (unique on employee + timestamp).
    let newPunches = 0;
    for (let i = 0; i < parsed.punches.length; i += CHUNK) {
      const batch = parsed.punches.slice(i, i + CHUNK).map((p) => ({ employeeId: p.employeeId, punchedAt: p.punchedAt, workDate: p.workDate, deviceId: p.deviceId, importJobId: jobId }));
      const res = await tx.insert(attendancePunches).values(batch).onConflictDoNothing().returning({ id: attendancePunches.id });
      newPunches += res.length;
    }

    // 2) Daily records. For punch logs, rebuild each affected day from ALL stored punches so that
    //    overlapping exports merge correctly.
    let daily: DailyRecord[] = parsed.daily;
    if (mapping.layout === "punches") {
      const keys = parsed.daily.map((d) => ({ e: d.employeeId, d: d.workDate }));
      const empIds = [...new Set(keys.map((k) => k.e))];
      const stored = await tx
        .select({ employeeId: attendancePunches.employeeId, workDate: attendancePunches.workDate, punchedAt: attendancePunches.punchedAt })
        .from(attendancePunches)
        .where(and(inArray(attendancePunches.employeeId, empIds), gte(attendancePunches.workDate, parsed.period.start!), lte(attendancePunches.workDate, parsed.period.end!)));
      const groups = new Map<string, number[]>();
      for (const p of stored) {
        const date = p.punchedAt.slice(0, 10);
        const mins = timeToMinutes(p.punchedAt.slice(11, 16)) + (date === p.workDate ? 0 : 1440);
        const k = `${p.employeeId}|${p.workDate}`;
        groups.set(k, [...(groups.get(k) ?? []), mins]);
      }
      const wanted = new Set(keys.map((k) => `${k.e}|${k.d}`));
      daily = [...groups.entries()].filter(([k]) => wanted.has(k)).map(([k, mins]) => {
        const [e, d] = k.split("|");
        return summarizeDay(Number(e), d, mins, pol);
      });
    }

    // Optional: employees with no record on a working day in the period are marked absent.
    if (input.markAbsent && parsed.period.start && parsed.period.end) {
      const active = await tx
        .select({ id: employees.id, joiningDate: employees.joiningDate, exitDate: employees.exitDate })
        .from(employees)
        .where(eq(employees.status, "active"));
      const existing = await tx
        .select({ e: attendanceRecords.employeeId, d: attendanceRecords.workDate })
        .from(attendanceRecords)
        .where(and(gte(attendanceRecords.workDate, parsed.period.start), lte(attendanceRecords.workDate, parsed.period.end)));
      const have = new Set([...existing.map((x) => `${x.e}|${x.d}`), ...daily.map((x) => `${x.employeeId}|${x.workDate}`)]);
      for (let d = parsed.period.start; d <= parsed.period.end; d = addDays(d, 1)) {
        const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
        if (pol.weeklyOffDays.includes(weekday)) continue;
        for (const emp of active) {
          if ((emp.joiningDate && emp.joiningDate > d) || (emp.exitDate && emp.exitDate < d)) continue;
          if (!have.has(`${emp.id}|${d}`)) {
            daily.push({ employeeId: emp.id, workDate: d, firstIn: null, lastOut: null, workedMinutes: null, punchCount: 0, status: "absent", isLate: false, notes: "No punches in device export" });
          }
        }
      }
    }

    // Upsert, but never overwrite records an admin entered manually.
    let inserted = 0;
    let updated = 0;
    let keptManual = 0;
    for (let i = 0; i < daily.length; i += CHUNK) {
      const batch = daily.slice(i, i + CHUNK).map((d) => ({ ...d, source: "import" as const, importJobId: jobId }));
      const res = await tx
        .insert(attendanceRecords)
        .values(batch)
        .onConflictDoUpdate({
          target: [attendanceRecords.employeeId, attendanceRecords.workDate],
          set: {
            firstIn: sql`excluded.first_in`,
            lastOut: sql`excluded.last_out`,
            workedMinutes: sql`excluded.worked_minutes`,
            punchCount: sql`excluded.punch_count`,
            status: sql`excluded.status`,
            isLate: sql`excluded.is_late`,
            notes: sql`excluded.notes`,
            importJobId: sql`excluded.import_job_id`,
            updatedAt: new Date(),
          },
          setWhere: sql`${attendanceRecords.source} = 'import'`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const r of res) {
        if (r.inserted) inserted++;
        else updated++;
      }
      keptManual += batch.length - res.length;
    }

    if (input.saveMappingName) await saveMapping(tx, "attendance", input.saveMappingName, mapping);

    const errorRows = parsed.issues.filter((x) => x.level === "error").length;
    const unmatchedRows = [...parsed.unmatched.values()].reduce((a, b) => a + b, 0);
    const [job] = await tx
      .update(importJobs)
      .set({
        status: "completed",
        mappingConfig: mapping,
        periodStart: parsed.period.start,
        periodEnd: parsed.period.end,
        totalRows: parsed.totalRows,
        importedRows: inserted,
        updatedRows: updated,
        skippedRows: parsed.skippedRows + parsed.inFileDuplicates + keptManual + unmatchedRows,
        errorRows,
        issues: {
          issues: parsed.issues.slice(0, 1000),
          unmatched: [...parsed.unmatched.entries()].map(([key, rows]) => ({ key, rows })),
          newPunches,
          keptManual,
          markAbsent: input.markAbsent,
        },
        completedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId))
      .returning();
    await audit(tx, ctx, {
      action: "import",
      entity: "attendance",
      entityId: jobId,
      summary: `Attendance import ${job.fileName}: ${inserted} new, ${updated} updated days, ${newPunches} new punches, ${keptManual} manual kept, ${errorRows} errors, ${unmatchedRows} unmatched rows${input.correctionReason ? ` [closed-year correction: ${input.correctionReason}]` : ""}`,
    });
    return { job, inserted, updated, newPunches, keptManual, errorRows, unmatchedRows };
  });
}

/** Saves (or replaces) a named column mapping for reuse with the same device/format. */
export async function saveMapping(tx: Tx, type: "attendance" | "timesheet", name: string, config: unknown) {
  const [existing] = await tx
    .select({ id: importMappings.id })
    .from(importMappings)
    .where(and(eq(importMappings.type, type), sql`lower(${importMappings.name}) = lower(${name})`));
  if (existing) {
    await tx.update(importMappings).set({ config, updatedAt: new Date() }).where(eq(importMappings.id, existing.id));
  } else {
    await tx.insert(importMappings).values({ type, name, config });
  }
}

export async function listImportJobs(db: Db, type: "attendance" | "timesheet", limit = 50) {
  return db.select().from(importJobs).where(eq(importJobs.type, type)).orderBy(desc(importJobs.createdAt)).limit(limit);
}

export async function deleteMapping(db: Db, ctx: Ctx, id: number) {
  const [row] = await db.delete(importMappings).where(eq(importMappings.id, id)).returning();
  if (!row) throw notFound("Mapping");
  await audit(db, ctx, { action: "delete", entity: "import_mapping", entityId: id, summary: `Deleted mapping ${row.name}` });
}

/* ------------------------------------------------------------------ manual records */

const timeOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ? v.slice(0, 5) : null))
  .refine((v) => v === null || /^\d{2}:\d{2}$/.test(v), "Use HH:MM");

export const attendanceInput = z.object({
  employeeId: z.coerce.number().int().positive(),
  workDate: isoDate,
  status: z.enum(ATTENDANCE_STATUSES),
  firstIn: timeOpt,
  lastOut: timeOpt,
  notes: optText(500),
  ...correction,
});

export async function saveManualAttendance(db: Db, ctx: Ctx, raw: unknown) {
  const input = attendanceInput.parse(raw);
  const pol = await policy(db);
  let worked: number | null = null;
  if (input.firstIn && input.lastOut) {
    try {
      worked = computeWorkedMinutes(input.firstIn, input.lastOut, 0);
    } catch (e) {
      throw new AppError((e as Error).message);
    }
  }
  const isLate = !!input.firstIn && timeToMinutes(input.firstIn) > timeToMinutes(pol.shiftStart) + pol.graceMinutes;
  return db.transaction(async (tx) => {
    const [fy] = await tx.select().from(financialYears).where(and(lte(financialYears.startDate, input.workDate), gte(financialYears.endDate, input.workDate)));
    if (fy) assertYearWritable(fy, input.correctionReason);
    const values = {
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: input.status,
      firstIn: input.firstIn,
      lastOut: input.lastOut,
      workedMinutes: worked,
      punchCount: [input.firstIn, input.lastOut].filter(Boolean).length,
      isLate,
      notes: input.notes,
      source: "manual" as const,
      importJobId: null,
    };
    const [row] = await tx
      .insert(attendanceRecords)
      .values(values)
      .onConflictDoUpdate({ target: [attendanceRecords.employeeId, attendanceRecords.workDate], set: { ...values, updatedAt: new Date() } })
      .returning();
    await audit(tx, ctx, { action: "save", entity: "attendance", entityId: row.id, summary: `Attendance ${input.workDate} employee #${input.employeeId}: ${input.status}${input.correctionReason ? ` [correction: ${input.correctionReason}]` : ""}` });
    return row;
  });
}

export async function deleteAttendance(db: Db, ctx: Ctx, id: number, correctionReason?: string | null) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, id));
    if (!row) throw notFound("Attendance record");
    const [fy] = await tx.select().from(financialYears).where(and(lte(financialYears.startDate, row.workDate), gte(financialYears.endDate, row.workDate)));
    if (fy) assertYearWritable(fy, correctionReason);
    await tx.delete(attendanceRecords).where(eq(attendanceRecords.id, id));
    await audit(tx, ctx, { action: "delete", entity: "attendance", entityId: id, summary: `Deleted attendance ${row.workDate} employee #${row.employeeId}` });
  });
}

/* ------------------------------------------------------------------ reporting */

export const rangeQuery = z
  .object({
    from: z.string().refine(isIsoDate),
    to: z.string().refine(isIsoDate),
    employeeId: z.coerce.number().int().positive().optional(),
    department: z.string().max(80).optional(),
  })
  .refine((v) => v.to >= v.from, "End date must be after start date");

export async function attendanceTotals(db: Db, raw: unknown) {
  const q = rangeQuery.parse(raw);
  const where = and(
    gte(attendanceRecords.workDate, q.from),
    lte(attendanceRecords.workDate, q.to),
    q.employeeId ? eq(attendanceRecords.employeeId, q.employeeId) : undefined,
    q.department ? eq(employees.department, q.department) : undefined,
  );
  const [row] = await db
    .select({
      records: countAll,
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
      absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
      halfDay: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'half_day')::int`,
      leave: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'leave')::int`,
      missingPunch: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'missing_punch')::int`,
      late: sql<number>`count(*) filter (where ${attendanceRecords.isLate})::int`,
      workedMinutes: sql<number>`coalesce(sum(${attendanceRecords.workedMinutes}),0)::int`,
      employees: sql<number>`count(distinct ${attendanceRecords.employeeId})::int`,
    })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .where(where);
  const [{ active }] = await db.select({ active: countAll }).from(employees).where(eq(employees.status, "active"));
  return { ...row, activeEmployees: active };
}

/** Per-employee summary for a range (monthly / FY / custom views). */
export async function attendanceByEmployee(db: Db, raw: unknown) {
  const q = rangeQuery.parse(raw);
  return db
    .select({
      employeeId: employees.id,
      name: employees.name,
      code: employees.employeeCode,
      department: employees.department,
      present: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'present')::int`,
      halfDay: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'half_day')::int`,
      absent: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'absent')::int`,
      leave: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'leave')::int`,
      missingPunch: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.status} = 'missing_punch')::int`,
      late: sql<number>`count(${attendanceRecords.id}) filter (where ${attendanceRecords.isLate})::int`,
      workedMinutes: sql<number>`coalesce(sum(${attendanceRecords.workedMinutes}),0)::int`,
    })
    .from(employees)
    .leftJoin(
      attendanceRecords,
      and(eq(attendanceRecords.employeeId, employees.id), gte(attendanceRecords.workDate, q.from), lte(attendanceRecords.workDate, q.to)),
    )
    .where(and(q.employeeId ? eq(employees.id, q.employeeId) : undefined, q.department ? eq(employees.department, q.department) : undefined, q.employeeId ? undefined : sql`(${employees.status} = 'active' or ${attendanceRecords.id} is not null)`))
    .groupBy(employees.id)
    .orderBy(asc(employees.name));
}

/** All active employees for one date, with their record (or none = not marked). */
export async function attendanceForDay(db: Db, date: string) {
  if (!isIsoDate(date)) throw new AppError("Invalid date.");
  return db
    .select({
      employeeId: employees.id,
      name: employees.name,
      code: employees.employeeCode,
      department: employees.department,
      recordId: attendanceRecords.id,
      status: attendanceRecords.status,
      firstIn: attendanceRecords.firstIn,
      lastOut: attendanceRecords.lastOut,
      workedMinutes: attendanceRecords.workedMinutes,
      punchCount: attendanceRecords.punchCount,
      isLate: attendanceRecords.isLate,
      source: attendanceRecords.source,
      notes: attendanceRecords.notes,
    })
    .from(employees)
    .leftJoin(attendanceRecords, and(eq(attendanceRecords.employeeId, employees.id), eq(attendanceRecords.workDate, date)))
    .where(sql`(${employees.status} = 'active' or ${attendanceRecords.id} is not null)`)
    .orderBy(asc(employees.name));
}

export async function attendanceRecordsInRange(db: Db, raw: unknown) {
  const q = rangeQuery.parse(raw);
  return db
    .select({
      id: attendanceRecords.id,
      employeeId: attendanceRecords.employeeId,
      name: employees.name,
      code: employees.employeeCode,
      workDate: attendanceRecords.workDate,
      status: attendanceRecords.status,
      firstIn: attendanceRecords.firstIn,
      lastOut: attendanceRecords.lastOut,
      workedMinutes: attendanceRecords.workedMinutes,
      isLate: attendanceRecords.isLate,
      source: attendanceRecords.source,
      notes: attendanceRecords.notes,
    })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .where(and(gte(attendanceRecords.workDate, q.from), lte(attendanceRecords.workDate, q.to), q.employeeId ? eq(attendanceRecords.employeeId, q.employeeId) : undefined, q.department ? eq(employees.department, q.department) : undefined))
    .orderBy(asc(attendanceRecords.workDate), asc(employees.name))
    .limit(100_000);
}
