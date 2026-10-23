import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import { pad } from "../dates";
import type { Db, Tx } from "../db";
import { financialYears } from "../db/schema";
import { AppError, conflict } from "../errors";
import { isoDate, optMoney, optText, reqText } from "../validation";
import { getSetting } from "./settings";
import { getYear } from "./shared";

export const yearInput = z
  .object({
    label: reqText(40),
    startDate: isoDate,
    endDate: isoDate,
    budget: optMoney,
    notes: optText(2000),
  })
  .refine((v) => v.endDate > v.startDate, { message: "End date must be after start date", path: ["endDate"] });

export const yearStatusInput = z.object({
  status: z.enum(["open", "closed", "archived"]),
  reason: optText(500),
});

export async function listYears(db: Db) {
  return db.select().from(financialYears).orderBy(desc(financialYears.startDate));
}

/** Suggests the next FY after the latest one (or the current one if none exist). */
export async function suggestNextYear(db: Db, today = new Date()) {
  const { startMonth } = await getSetting(db, "financialYear");
  const [latest] = await db.select().from(financialYears).orderBy(desc(financialYears.startDate)).limit(1);
  let startYear: number;
  if (latest) {
    startYear = Number(latest.startDate.slice(0, 4)) + 1;
  } else {
    const y = today.getFullYear();
    startYear = today.getMonth() + 1 >= startMonth ? y : y - 1;
  }
  const startDate = `${startYear}-${pad(startMonth)}-01`;
  const endDt = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  const endDate = `${endDt.getUTCFullYear()}-${pad(endDt.getUTCMonth() + 1)}-${pad(endDt.getUTCDate())}`;
  const endYear = endDt.getUTCFullYear();
  const label = endYear === startYear ? `FY ${startYear}` : `FY ${startYear}-${String(endYear).slice(-2)}`;
  return { label, startDate, endDate };
}

async function assertNoOverlap(db: Tx, startDate: string, endDate: string, excludeId?: number) {
  const [overlap] = await db
    .select({ label: financialYears.label })
    .from(financialYears)
    .where(
      and(
        lte(financialYears.startDate, endDate),
        gte(financialYears.endDate, startDate),
        excludeId ? ne(financialYears.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (overlap) throw conflict(`These dates overlap ${overlap.label}.`);
}

export async function createYear(db: Db, ctx: Ctx, raw: unknown) {
  const input = yearInput.parse(raw);
  return db.transaction(async (tx) => {
    // Serialize year creation so two admins cannot create overlapping years at once.
    await tx.execute(sql`select pg_advisory_xact_lock(4242001)`);
    await assertNoOverlap(tx, input.startDate, input.endDate);
    const [row] = await tx.insert(financialYears).values({ ...input, status: "open" }).returning();
    await audit(tx, ctx, { action: "create", entity: "financial_year", entityId: row.id, summary: `Created ${row.label}` });
    return row;
  });
}

export async function updateYear(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = yearInput.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242001)`);
    const before = await getYear(tx, id);
    if (before.status === "archived") throw new AppError("Reopen an archived year before editing it.", 423, "year_locked");
    await assertNoOverlap(tx, input.startDate, input.endDate, id);
    if (input.startDate !== before.startDate || input.endDate !== before.endDate) {
      // Moving boundaries must not orphan existing transactions.
      const res = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from (
          select expense_date d from expenses where financial_year_id = ${id}
          union all select purchase_date from materials where financial_year_id = ${id} and purchase_date is not null
          union all select invoice_date from invoices where financial_year_id = ${id}
          union all select receipt_date from receipts where financial_year_id = ${id}
          union all select period_month from payroll_records where financial_year_id = ${id}
        ) x where d < ${input.startDate} or d > ${input.endDate}`);
      if (Number(res.rows[0]?.n) > 0) {
        throw conflict("Some records in this year fall outside the new dates. Move them first.");
      }
    }
    const [row] = await tx
      .update(financialYears)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(financialYears.id, id))
      .returning();
    await audit(tx, ctx, {
      action: "update",
      entity: "financial_year",
      entityId: id,
      summary: `Updated ${row.label}`,
      changes: diff(before, row),
    });
    return row;
  });
}

export async function setYearStatus(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const { status, reason } = yearStatusInput.parse(raw);
  return db.transaction(async (tx) => {
    const before = await getYear(tx, id);
    if (before.status === status) return before;
    const [row] = await tx
      .update(financialYears)
      .set({ status, updatedAt: new Date() })
      .where(eq(financialYears.id, id))
      .returning();
    await audit(tx, ctx, {
      action: status === "open" ? "reopen" : status === "closed" ? "close" : "archive",
      entity: "financial_year",
      entityId: id,
      summary: `${row.label}: ${before.status} → ${status}${reason ? ` (${reason})` : ""}`,
    });
    return row;
  });
}

export async function deleteYear(db: Db, ctx: Ctx, id: number) {
  return db.transaction(async (tx) => {
    const fy = await getYear(tx, id);
    const res = await tx.execute<{ n: number }>(sql`
      select (select count(*) from projects where financial_year_id = ${id})
           + (select count(*) from expenses where financial_year_id = ${id})
           + (select count(*) from materials where financial_year_id = ${id})
           + (select count(*) from invoices where financial_year_id = ${id})
           + (select count(*) from receipts where financial_year_id = ${id})
           + (select count(*) from payroll_records where financial_year_id = ${id}) as n`);
    if (Number(res.rows[0]?.n) > 0) {
      throw conflict(`${fy.label} has records. Close or archive it instead of deleting.`);
    }
    await tx.delete(financialYears).where(eq(financialYears.id, id));
    await audit(tx, ctx, { action: "delete", entity: "financial_year", entityId: id, summary: `Deleted empty year ${fy.label}` });
  });
}

export async function yearOptions(db: Db) {
  return db
    .select({ id: financialYears.id, label: financialYears.label, status: financialYears.status, startDate: financialYears.startDate, endDate: financialYears.endDate })
    .from(financialYears)
    .orderBy(asc(financialYears.startDate));
}
