import { and, asc, desc, gte, ilike, isNotNull, isNull, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Tx } from "../db";
import { financialYears } from "../db/schema";
import { AppError, locked, notFound } from "../errors";
import type { ListQuery } from "../validation";

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function pageOf<T>(rows: T[], total: number, q: Pick<ListQuery, "page" | "pageSize">): Page<T> {
  return { rows, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export function offset(q: Pick<ListQuery, "page" | "pageSize">) {
  return (q.page - 1) * q.pageSize;
}

/** Case-insensitive "contains" across several text columns. */
export function search(q: string | undefined, cols: AnyColumn[]): SQL | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(...cols.map((c) => ilike(c, pattern)));
}

export function dateRange(col: AnyColumn, from?: string, to?: string) {
  return and(from ? gte(col, from) : undefined, to ? lte(col, to) : undefined);
}

export function archivedFilter(col: AnyColumn, mode?: "only" | "include") {
  if (mode === "include") return undefined;
  return mode === "only" ? isNotNull(col) : isNull(col);
}

/** Whitelisted sorting: unknown keys fall back to the default. */
export function orderBy(
  sortable: Record<string, AnyColumn | SQL>,
  q: Pick<ListQuery, "sort" | "dir">,
  fallback: SQL[],
): SQL[] {
  const col = q.sort ? sortable[q.sort] : undefined;
  if (!col) return fallback;
  return [q.dir === "asc" ? asc(col) : desc(col)];
}

export const countAll = sql<number>`count(*)::int`;

/* --------------------------------------------------- financial-year resolution & locking */

export type YearRow = typeof financialYears.$inferSelect;

export async function getYear(db: Tx, id: number) {
  const [fy] = await db.select().from(financialYears).where(sql`${financialYears.id} = ${id}`).limit(1);
  if (!fy) throw notFound("Financial year");
  return fy;
}

/** Every dated transaction belongs to the financial year that contains its date. */
export async function resolveYear(db: Tx, isoDate: string) {
  const [fy] = await db
    .select()
    .from(financialYears)
    .where(and(lte(financialYears.startDate, isoDate), gte(financialYears.endDate, isoDate)))
    .limit(1);
  if (!fy) {
    throw new AppError(
      `No financial year covers ${isoDate}. Create it under Financial Years first.`,
      400,
      "no_financial_year",
    );
  }
  return fy;
}

/**
 * Closed years accept changes only with a correction reason (recorded in the audit log).
 * Archived years are read-only until reopened.
 */
export function assertYearWritable(fy: YearRow, correctionReason?: string | null) {
  if (fy.status === "archived") {
    throw locked(`${fy.label} is archived and read-only. Reopen it under Financial Years to make changes.`);
  }
  if (fy.status === "closed" && !correctionReason) {
    throw locked(`${fy.label} is closed. Enter a correction reason to change its records.`);
  }
  return fy.status === "closed";
}

/** Resolve + lock-check in one step; returns the year and whether this is an audited correction. */
export async function writableYearFor(db: Tx, isoDate: string, correctionReason?: string | null) {
  const fy = await resolveYear(db, isoDate);
  const isCorrection = assertYearWritable(fy, correctionReason);
  return { fy, isCorrection };
}

/** Lock check for date-based records (attendance, timesheets) that have no FK to a year. */
export async function assertDateWritable(db: Tx, isoDate: string, correctionReason?: string | null) {
  const [fy] = await db
    .select()
    .from(financialYears)
    .where(and(lte(financialYears.startDate, isoDate), gte(financialYears.endDate, isoDate)))
    .limit(1);
  if (fy) assertYearWritable(fy, correctionReason);
}

export function correctionNote(isCorrection: boolean, reason?: string | null) {
  return isCorrection ? ` [closed-year correction: ${reason}]` : "";
}
