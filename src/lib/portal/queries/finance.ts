/**
 * Single source of truth for financial figures. Dashboards, reports and exports all call these.
 *
 * Definitions:
 *  - Recorded expenditure = Σ expenses.total_amount + Σ payroll.net_payable      (archived rows excluded)
 *  - Paid expenditure     = Σ expenses.amount_paid  + Σ payroll.amount_paid
 *  - Unpaid liabilities   = recorded − paid
 *  - Project costs        = expenses with a project
 *  - Office & admin       = expenses without a project (company overheads)
 *  - Materials & spares   = expenses created from material purchases (subset of the above, never added twice)
 *  - Invoiced             = Σ invoices.total_amount (not cancelled)  — billed, not collected
 *  - Received             = Σ receipts.amount                         — cash actually collected
 *                           (a cancelled/archived invoice can't have active receipts — see receivables.ts)
 *  - Receivables          = invoiced − received
 *  - Contract value       = Σ projects.contract_value — an agreement value, never reported as revenue
 */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { subMoney, addMoney } from "../money";

export type FinanceFilter = { fy?: number; from?: string; to?: string; projectId?: number };

function cond(f: FinanceFilter, alias: string, dateCol: string, fyCol = "financial_year_id"): SQL {
  const parts: SQL[] = [sql.raw("true")];
  if (f.fy) parts.push(sql`${sql.raw(`${alias}.${fyCol}`)} = ${f.fy}`);
  if (f.from) parts.push(sql`${sql.raw(`${alias}.${dateCol}`)} >= ${f.from}`);
  if (f.to) parts.push(sql`${sql.raw(`${alias}.${dateCol}`)} <= ${f.to}`);
  return sql.join(parts, sql` and `);
}

export async function financeTotals(db: Db, f: FinanceFilter = {}) {
  const e = cond(f, "e", "expense_date");
  const p = cond(f, "p", "period_month");
  const i = cond(f, "i", "invoice_date");
  const r = cond(f, "r", "receipt_date");
  const proj = f.projectId ? sql` and e.project_id = ${f.projectId}` : sql``;
  const res = await db.execute<Record<string, string>>(sql`
    with exp as (
      select
        coalesce(sum(e.total_amount),0) as total,
        coalesce(sum(e.amount_paid),0) as paid,
        coalesce(sum(e.total_amount) filter (where e.project_id is not null),0) as project,
        coalesce(sum(e.total_amount) filter (where e.project_id is null),0) as office,
        coalesce(sum(e.total_amount) filter (where e.source = 'material'),0) as materials,
        coalesce(sum(e.gst_amount),0) as gst
      from expenses e where e.archived_at is null and ${e}${proj}
    ),
    pay as (
      select coalesce(sum(p.net_payable),0) as net, coalesce(sum(p.amount_paid),0) as paid
      from payroll_records p where ${p} ${f.projectId ? sql`and false` : sql``}
    ),
    inv as (
      select coalesce(sum(i.total_amount),0) as invoiced from invoices i
      where i.archived_at is null and i.status <> 'cancelled' and ${i} ${f.projectId ? sql`and i.project_id = ${f.projectId}` : sql``}
    ),
    rec as (
      select coalesce(sum(r.amount),0) as received from receipts r
      where r.archived_at is null and ${r} ${f.projectId ? sql`and r.project_id = ${f.projectId}` : sql``}
    ),
    prj as (
      select count(*)::int as projects,
             count(*) filter (where status = 'active')::int as active,
             coalesce(sum(contract_value),0) as contract_value,
             coalesce(sum(budget),0) as project_budget
      from projects pr where pr.archived_at is null
        ${f.fy ? sql`and (pr.financial_year_id = ${f.fy} or exists (select 1 from expenses x where x.project_id = pr.id and x.financial_year_id = ${f.fy}))` : sql``}
        ${f.projectId ? sql`and pr.id = ${f.projectId}` : sql``}
    ),
    emp as (select count(*) filter (where status = 'active')::int as active_employees, count(*)::int as employees from employees),
    bud as (select coalesce(sum(budget),0) as year_budget from financial_years fy ${f.fy ? sql`where fy.id = ${f.fy}` : sql``})
    select exp.total as expenses_total, exp.paid as expenses_paid, exp.project, exp.office, exp.materials, exp.gst,
           pay.net as payroll_net, pay.paid as payroll_paid,
           inv.invoiced, rec.received,
           prj.projects, prj.active, prj.contract_value, prj.project_budget,
           emp.active_employees, emp.employees, bud.year_budget
    from exp, pay, inv, rec, prj, emp, bud`);
  const t = res.rows[0];
  const recorded = addMoney(t.expenses_total, t.payroll_net);
  const paid = addMoney(t.expenses_paid, t.payroll_paid);
  return {
    recordedExpenditure: recorded,
    paidExpenditure: paid,
    unpaidLiabilities: subMoney(recorded, paid),
    expensesTotal: addMoney(t.expenses_total),
    projectCosts: addMoney(t.project),
    officeCosts: addMoney(t.office),
    materialsCosts: addMoney(t.materials),
    gstTotal: addMoney(t.gst),
    payrollNet: addMoney(t.payroll_net),
    payrollPaid: addMoney(t.payroll_paid),
    invoiced: addMoney(t.invoiced),
    received: addMoney(t.received),
    receivables: subMoney(t.invoiced, t.received),
    contractValue: addMoney(t.contract_value),
    projectBudget: addMoney(t.project_budget),
    yearBudget: addMoney(t.year_budget),
    projects: Number(t.projects),
    activeProjects: Number(t.active),
    employees: Number(t.employees),
    activeEmployees: Number(t.active_employees),
  };
}

/** One row per financial year — the Master Dashboard comparison table. */
export async function yearComparison(db: Db) {
  const res = await db.execute<Record<string, string>>(sql`
    select fy.id, fy.label, fy.status, fy.start_date::text as start_date, fy.end_date::text as end_date, coalesce(fy.budget,0) as budget,
      (select count(*) from projects pr where pr.archived_at is null and (pr.financial_year_id = fy.id
          or exists (select 1 from expenses x where x.project_id = pr.id and x.financial_year_id = fy.id)))::int as projects,
      coalesce(e.project,0) as project_costs, coalesce(e.office,0) as office_costs, coalesce(e.materials,0) as materials,
      coalesce(e.total,0) as expenses_total, coalesce(e.paid,0) as expenses_paid,
      coalesce(p.net,0) as payroll, coalesce(p.paid,0) as payroll_paid,
      coalesce(i.invoiced,0) as invoiced, coalesce(r.received,0) as received
    from financial_years fy
    left join lateral (select sum(total_amount) total, sum(amount_paid) paid,
        sum(total_amount) filter (where project_id is not null) project,
        sum(total_amount) filter (where project_id is null) office,
        sum(total_amount) filter (where source = 'material') materials
      from expenses where financial_year_id = fy.id and archived_at is null) e on true
    left join lateral (select sum(net_payable) net, sum(amount_paid) paid from payroll_records where financial_year_id = fy.id) p on true
    left join lateral (select sum(total_amount) invoiced from invoices where financial_year_id = fy.id and archived_at is null and status <> 'cancelled') i on true
    left join lateral (select sum(amount) received from receipts where financial_year_id = fy.id and archived_at is null) r on true
    order by fy.start_date`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    label: r.label,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    budget: addMoney(r.budget),
    projects: Number(r.projects),
    projectCosts: addMoney(r.project_costs),
    officeCosts: addMoney(r.office_costs),
    materials: addMoney(r.materials),
    payroll: addMoney(r.payroll),
    totalExpenditure: addMoney(r.expenses_total, r.payroll),
    paid: addMoney(r.expenses_paid, r.payroll_paid),
    invoiced: addMoney(r.invoiced),
    received: addMoney(r.received),
  }));
}

/** Monthly expenses + payroll (+ receipts) for trend charts. */
export async function monthlyTrend(db: Db, f: FinanceFilter = {}) {
  const res = await db.execute<Record<string, string>>(sql`
    with months as (
      select to_char(date_trunc('month', e.expense_date), 'YYYY-MM') m,
             sum(e.total_amount) filter (where e.project_id is not null) project,
             sum(e.total_amount) filter (where e.project_id is null) office,
             0::numeric payroll, 0::numeric received
      from expenses e where e.archived_at is null and ${cond(f, "e", "expense_date")}
        ${f.projectId ? sql`and e.project_id = ${f.projectId}` : sql``}
      group by 1
      union all
      select to_char(p.period_month, 'YYYY-MM'), 0, 0, sum(p.net_payable), 0
      from payroll_records p where ${cond(f, "p", "period_month")} ${f.projectId ? sql`and false` : sql``} group by 1
      union all
      select to_char(date_trunc('month', r.receipt_date), 'YYYY-MM'), 0, 0, 0, sum(r.amount)
      from receipts r where r.archived_at is null and ${cond(f, "r", "receipt_date")}
        ${f.projectId ? sql`and r.project_id = ${f.projectId}` : sql``}
      group by 1
    )
    select m as month, coalesce(sum(project),0) project, coalesce(sum(office),0) office,
           coalesce(sum(payroll),0) payroll, coalesce(sum(received),0) received
    from months group by m order by m`);
  return res.rows.map((r) => ({
    month: r.month,
    project: Number(r.project),
    office: Number(r.office),
    payroll: Number(r.payroll),
    received: Number(r.received),
    total: Number(addMoney(r.project, r.office, r.payroll)),
  }));
}

export async function categoryBreakdown(db: Db, f: FinanceFilter = {}) {
  const res = await db.execute<Record<string, string>>(sql`
    select c.name as category, c.kind, sum(e.total_amount) as total, count(*)::int as entries
    from expenses e join categories c on c.id = e.category_id
    where e.archived_at is null and ${cond(f, "e", "expense_date")} ${f.projectId ? sql`and e.project_id = ${f.projectId}` : sql``}
    group by c.name, c.kind order by sum(e.total_amount) desc`);
  return res.rows.map((r) => ({ category: r.category, kind: r.kind, total: addMoney(r.total), entries: Number(r.entries) }));
}

export async function topProjects(db: Db, f: FinanceFilter = {}, limit = 10) {
  const res = await db.execute<Record<string, string>>(sql`
    select pr.id, pr.code, pr.name, pr.status, coalesce(pr.budget,0) budget, coalesce(pr.contract_value,0) contract_value,
           coalesce(sum(e.total_amount),0) actual
    from projects pr
    join expenses e on e.project_id = pr.id and e.archived_at is null and ${cond(f, "e", "expense_date")}
    where pr.archived_at is null
    group by pr.id order by actual desc limit ${limit}`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    code: r.code,
    name: r.name,
    status: r.status,
    budget: addMoney(r.budget),
    contractValue: addMoney(r.contract_value),
    actual: addMoney(r.actual),
  }));
}

/** Budget vs actual per project (actual from expenses in the filter window). */
export async function projectBudgetVsActual(db: Db, f: FinanceFilter = {}) {
  const res = await db.execute<Record<string, string>>(sql`
    select pr.id, pr.code, pr.name, pr.status, fy.label as year, coalesce(pr.budget,0) budget, coalesce(pr.contract_value,0) contract_value,
      coalesce((select sum(e.total_amount) from expenses e where e.project_id = pr.id and e.archived_at is null and ${cond(f, "e", "expense_date")}),0) actual,
      coalesce((select sum(i.total_amount) from invoices i where i.project_id = pr.id and i.archived_at is null and i.status <> 'cancelled' and ${cond(f, "i", "invoice_date")}),0) invoiced,
      coalesce((select sum(r.amount) from receipts r where r.project_id = pr.id and r.archived_at is null and ${cond(f, "r", "receipt_date")}),0) received
    from projects pr join financial_years fy on fy.id = pr.financial_year_id
    where pr.archived_at is null
      ${f.fy ? sql`and (pr.financial_year_id = ${f.fy} or exists (select 1 from expenses x where x.project_id = pr.id and x.financial_year_id = ${f.fy}))` : sql``}
      ${f.projectId ? sql`and pr.id = ${f.projectId}` : sql``}
    order by pr.code`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    code: r.code,
    name: r.name,
    status: r.status,
    year: r.year,
    budget: addMoney(r.budget),
    contractValue: addMoney(r.contract_value),
    actual: addMoney(r.actual),
    variance: subMoney(r.budget, r.actual),
    invoiced: addMoney(r.invoiced),
    received: addMoney(r.received),
    receivable: subMoney(r.invoiced, r.received),
    estimatedBalance: subMoney(r.contract_value, r.actual),
  }));
}

export async function supplierSpending(db: Db, f: FinanceFilter = {}) {
  const res = await db.execute<Record<string, string>>(sql`
    select s.id, s.code, s.name, s.category, count(e.id)::int entries,
           coalesce(sum(e.total_amount),0) total, coalesce(sum(e.amount_paid),0) paid
    from expenses e join suppliers s on s.id = e.supplier_id
    where e.archived_at is null and ${cond(f, "e", "expense_date")} ${f.projectId ? sql`and e.project_id = ${f.projectId}` : sql``}
    group by s.id order by total desc`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    code: r.code,
    name: r.name,
    category: r.category,
    entries: Number(r.entries),
    total: addMoney(r.total),
    paid: addMoney(r.paid),
    outstanding: subMoney(r.total, r.paid),
  }));
}

/** Unpaid/partly paid expenses and payroll — the outstanding payments report. */
export async function outstandingPayments(db: Db, f: FinanceFilter = {}) {
  const res = await db.execute<Record<string, string>>(sql`
    select 'expense' as type, e.id, e.expense_date::text as date, e.description, coalesce(s.name, e.payee_name, '') as party,
           pr.code as project, e.total_amount as total, e.amount_paid as paid, (e.total_amount - e.amount_paid) as outstanding, e.payment_status as status
    from expenses e left join suppliers s on s.id = e.supplier_id left join projects pr on pr.id = e.project_id
    where e.archived_at is null and e.payment_status <> 'paid' and ${cond(f, "e", "expense_date")} ${f.projectId ? sql`and e.project_id = ${f.projectId}` : sql``}
    union all
    select 'payroll', p.id, p.period_month::text, 'Salary ' || to_char(p.period_month, 'Mon YYYY'), em.name, null,
           p.net_payable, p.amount_paid, (p.net_payable - p.amount_paid), p.payment_status
    from payroll_records p join employees em on em.id = p.employee_id
    where p.payment_status <> 'paid' and ${cond(f, "p", "period_month")} ${f.projectId ? sql`and false` : sql``}
    order by 3`);
  return res.rows.map((r) => ({ ...r, id: Number(r.id), total: addMoney(r.total), paid: addMoney(r.paid), outstanding: addMoney(r.outstanding) }));
}
