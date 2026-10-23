import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { categories, documents, expenses, financialYears, invoices, materials, projects, receipts, timesheets } from "../db/schema";
import { conflict, notFound } from "../errors";
import { addMoney, normalizeMoney, subMoney } from "../money";
import { id as idSchema, listQuery, optDate, optMoney, optText, reqText } from "../validation";
import { archivedFilter, assertYearWritable, countAll, getYear, offset, orderBy, pageOf, search } from "./shared";

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "cancelled"] as const;

export const projectInput = z
  .object({
    code: optText(30),
    name: reqText(200),
    financialYearId: idSchema,
    customer: optText(200),
    description: optText(4000),
    poReference: optText(120),
    startDate: optDate,
    expectedEndDate: optDate,
    actualEndDate: optDate,
    status: z.enum(PROJECT_STATUSES).default("active"),
    budget: optMoney,
    contractValue: optMoney,
    managerName: optText(120),
    notes: optText(4000),
  })
  .refine((v) => !v.startDate || !v.expectedEndDate || v.expectedEndDate >= v.startDate, {
    message: "Expected completion must be on or after the start date",
    path: ["expectedEndDate"],
  })
  .refine((v) => !v.startDate || !v.actualEndDate || v.actualEndDate >= v.startDate, {
    message: "Actual completion must be on or after the start date",
    path: ["actualEndDate"],
  });

export const projectListQuery = listQuery.extend({ status: z.enum(PROJECT_STATUSES).optional() });

const live = (col: typeof expenses.archivedAt) => isNull(col);

/** SQL fragments for per-project money, optionally limited to one financial year. */
function projectMoney(fy?: number) {
  const fyExp = fy ? sql`and e.financial_year_id = ${fy}` : sql``;
  const fyInv = fy ? sql`and i.financial_year_id = ${fy}` : sql``;
  const fyRec = fy ? sql`and r.financial_year_id = ${fy}` : sql``;
  return {
    actualCost: sql<string>`(select coalesce(sum(e.total_amount),0) from expenses e where e.project_id = projects.id and e.archived_at is null ${fyExp})`,
    paidCost: sql<string>`(select coalesce(sum(e.amount_paid),0) from expenses e where e.project_id = projects.id and e.archived_at is null ${fyExp})`,
    materialsCost: sql<string>`(select coalesce(sum(e.total_amount),0) from expenses e where e.project_id = projects.id and e.archived_at is null and e.source = 'material' ${fyExp})`,
    invoiced: sql<string>`(select coalesce(sum(i.total_amount),0) from invoices i where i.project_id = projects.id and i.archived_at is null and i.status <> 'cancelled' ${fyInv})`,
    received: sql<string>`(select coalesce(sum(r.amount),0) from receipts r where r.project_id = projects.id and r.archived_at is null ${fyRec})`,
  };
}

function normMoney<T extends { actualCost: string; paidCost: string; materialsCost: string; invoiced: string; received: string }>(r: T) {
  return {
    actualCost: normalizeMoney(r.actualCost),
    paidCost: normalizeMoney(r.paidCost),
    materialsCost: normalizeMoney(r.materialsCost),
    invoiced: normalizeMoney(r.invoiced),
    received: normalizeMoney(r.received),
  };
}

/** A project belongs to a year's register if it was opened in that year or has activity in it. */
export function projectInYear(fy: number) {
  return or(
    eq(projects.financialYearId, fy),
    sql`exists (select 1 from expenses e where e.project_id = projects.id and e.financial_year_id = ${fy})`,
    sql`exists (select 1 from invoices i where i.project_id = projects.id and i.financial_year_id = ${fy})`,
    sql`exists (select 1 from materials m where m.project_id = projects.id and m.financial_year_id = ${fy})`,
  );
}

export async function listProjects(db: Db, raw: unknown) {
  const q = projectListQuery.parse(raw);
  const where = and(
    q.fy ? projectInYear(q.fy) : undefined,
    q.status ? eq(projects.status, q.status) : undefined,
    archivedFilter(projects.archivedAt, q.archived),
    search(q.q, [projects.name, projects.code, projects.customer, projects.poReference, projects.managerName]),
  );
  const m = projectMoney(q.fy);
  const sortable = {
    code: projects.code,
    name: projects.name,
    status: projects.status,
    startDate: projects.startDate,
    budget: projects.budget,
    contractValue: projects.contractValue,
    actualCost: m.actualCost,
  };
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        customer: projects.customer,
        status: projects.status,
        startDate: projects.startDate,
        expectedEndDate: projects.expectedEndDate,
        budget: projects.budget,
        contractValue: projects.contractValue,
        yearLabel: financialYears.label,
        financialYearId: projects.financialYearId,
        archivedAt: projects.archivedAt,
        ...m,
      })
      .from(projects)
      .innerJoin(financialYears, eq(financialYears.id, projects.financialYearId))
      .where(where)
      .orderBy(...orderBy(sortable, q, [desc(projects.createdAt)]))
      .limit(q.pageSize)
      .offset(offset(q)),
    db.select({ total: countAll }).from(projects).where(where),
  ]);
  return pageOf(
    rows.map((r) => ({ ...r, ...normMoney(r), receivable: subMoney(r.invoiced, r.received) })),
    total,
    q,
  );
}

export async function projectOptions(db: Tx, fy?: number) {
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(isNull(projects.archivedAt), fy ? projectInYear(fy) : undefined))
    .orderBy(asc(projects.code));
}

export async function getProjectRow(db: Tx, id: number) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) throw notFound("Project");
  return row;
}

/** Project dashboard: overview, money (all-time and per year), cost breakdowns. */
export async function getProjectDashboard(db: Db, id: number, fy?: number) {
  const project = await getProjectRow(db, id);
  const m = projectMoney(fy);
  const fyExp = fy ? eq(expenses.financialYearId, fy) : undefined;

  const [[money], byCategory, byMonth, byYear, [materialPlan], [hours], [docCount], [yearRow]] = await Promise.all([
    db.select(m).from(projects).where(eq(projects.id, id)),
    db
      .select({ category: categories.name, kind: categories.kind, total: sql<string>`sum(${expenses.totalAmount})` })
      .from(expenses)
      .innerJoin(categories, eq(categories.id, expenses.categoryId))
      .where(and(eq(expenses.projectId, id), live(expenses.archivedAt), fyExp))
      .groupBy(categories.name, categories.kind)
      .orderBy(desc(sql`sum(${expenses.totalAmount})`)),
    db
      .select({ month: sql<string>`to_char(date_trunc('month', ${expenses.expenseDate}), 'YYYY-MM-01')`, total: sql<string>`sum(${expenses.totalAmount})` })
      .from(expenses)
      .where(and(eq(expenses.projectId, id), live(expenses.archivedAt), fyExp))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ year: financialYears.label, fyId: financialYears.id, total: sql<string>`sum(${expenses.totalAmount})` })
      .from(expenses)
      .innerJoin(financialYears, eq(financialYears.id, expenses.financialYearId))
      .where(and(eq(expenses.projectId, id), live(expenses.archivedAt)))
      .groupBy(financialYears.label, financialYears.id, financialYears.startDate)
      .orderBy(financialYears.startDate),
    db
      .select({
        planned: sql<string>`coalesce(sum(case when ${materials.status} = 'planned' then ${materials.totalAmount} end), 0)`,
        purchased: sql<string>`coalesce(sum(case when ${materials.status} <> 'planned' then ${materials.totalAmount} end), 0)`,
        items: countAll,
      })
      .from(materials)
      .where(and(eq(materials.projectId, id), isNull(materials.archivedAt), fy ? eq(materials.financialYearId, fy) : undefined)),
    db
      .select({ minutes: sql<number>`coalesce(sum(${timesheets.totalMinutes}), 0)::int` })
      .from(timesheets)
      .where(eq(timesheets.projectId, id)),
    db.select({ n: countAll }).from(documents).where(and(eq(documents.projectId, id), isNull(documents.archivedAt))),
    db.select({ label: financialYears.label, status: financialYears.status }).from(financialYears).where(eq(financialYears.id, project.financialYearId)),
  ]);

  Object.assign(money, normMoney(money));
  const otherCost = subMoney(money.actualCost, money.materialsCost);
  return {
    project: { ...project, yearLabel: yearRow?.label, yearStatus: yearRow?.status },
    money: {
      ...money,
      otherCost,
      outstandingPayables: subMoney(money.actualCost, money.paidCost),
      receivable: subMoney(money.invoiced, money.received),
      budgetRemaining: project.budget ? subMoney(project.budget, money.actualCost) : null,
      estimatedBalance: project.contractValue ? subMoney(project.contractValue, money.actualCost) : null,
      estimatedTotalCost: addMoney(money.actualCost, materialPlan.planned),
    },
    byCategory,
    byMonth,
    byYear,
    materialPlan,
    timesheetMinutes: hours.minutes,
    documentCount: docCount.n,
  };
}

async function nextCode(db: Tx) {
  const res = await db.execute<{ n: number }>(
    sql`select coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) + 1 as n from projects where code ~* '^PRJ-\\d+$'`,
  );
  return `PRJ-${String(res.rows[0]?.n ?? 1).padStart(3, "0")}`;
}

export async function createProject(db: Db, ctx: Ctx, raw: unknown) {
  const input = projectInput.parse(raw);
  return db.transaction(async (tx) => {
    const fy = await getYear(tx, input.financialYearId);
    assertYearWritable(fy, null);
    await tx.execute(sql`select pg_advisory_xact_lock(4242003)`);
    const code = input.code || (await nextCode(tx));
    const [row] = await tx.insert(projects).values({ ...input, code }).returning();
    await audit(tx, ctx, { action: "create", entity: "project", entityId: row.id, summary: `Created project ${row.code} · ${row.name} in ${fy.label}` });
    return row;
  });
}

export async function updateProject(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const input = projectInput.parse(raw);
  return db.transaction(async (tx) => {
    const before = await getProjectRow(tx, id);
    if (before.archivedAt) throw conflict("Restore this project before editing it.");
    const [row] = await tx
      .update(projects)
      .set({ ...input, code: input.code || before.code, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    await audit(tx, ctx, { action: "update", entity: "project", entityId: id, summary: `Updated project ${row.code}`, changes: diff(before, row) });
    return row;
  });
}

export async function setProjectArchived(db: Db, ctx: Ctx, id: number, archived: boolean) {
  return db.transaction(async (tx) => {
    const before = await getProjectRow(tx, id);
    const [row] = await tx
      .update(projects)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    await audit(tx, ctx, { action: archived ? "archive" : "restore", entity: "project", entityId: id, summary: `${archived ? "Archived" : "Restored"} project ${before.code}` });
    return row;
  });
}

/** Lists the receivables for a project (used on the project page). */
export async function projectReceivables(db: Db, projectId: number) {
  const [inv, rec] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.projectId, projectId), isNull(invoices.archivedAt))).orderBy(desc(invoices.invoiceDate)),
    db.select().from(receipts).where(and(eq(receipts.projectId, projectId), isNull(receipts.archivedAt))).orderBy(desc(receipts.receiptDate)),
  ]);
  return { invoices: inv, receipts: rec };
}
