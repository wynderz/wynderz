import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Donut, MoneyBars } from "@/components/portal/charts";
import { FormDrawer, PrintButton } from "@/components/portal/forms";
import { fmtDate, fmtMonth, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, ProgressBar } from "@/components/portal/ui";
import { projectFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { requirePortal } from "@/lib/portal/page";
import { categoryBreakdown, financeTotals, monthlyTrend } from "@/lib/portal/queries/finance";
import { listProjects } from "@/lib/portal/services/projects";
import { getYear } from "@/lib/portal/services/shared";

export const metadata: Metadata = { title: "Year Dashboard" };

const MODULES = [
  { href: "/portal/expenses", label: "Expenses" },
  { href: "/portal/expenses?scope=general", label: "Office & Admin" },
  { href: "/portal/materials", label: "Materials & Spares" },
  { href: "/portal/receivables", label: "Invoices & Receipts" },
  { href: "/portal/payroll", label: "Payroll" },
  { href: "/portal/attendance", label: "Attendance" },
  { href: "/portal/timesheets", label: "Timesheets" },
  { href: "/portal/suppliers", label: "Suppliers" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/reports", label: "Reports" },
];

export default async function YearPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePortal();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const year = await getYear(db, id).catch(() => null);
  if (!year) notFound();

  const [totals, trend, categories, register, lookups] = await Promise.all([
    financeTotals(db, { fy: id }),
    monthlyTrend(db, { fy: id }),
    categoryBreakdown(db, { fy: id }),
    listProjects(db, { fy: id, pageSize: 200, sort: "code", dir: "asc" }),
    loadLookups(db, ["years"]),
  ]);
  const withFy = (href: string) => `${href}${href.includes("?") ? "&" : "?"}fy=${id}`;
  const budget = Number(totals.yearBudget);
  const spent = Number(totals.recordedExpenditure);
  const statusCounts = register.rows.reduce<Record<string, number>>((acc, p) => ((acc[p.status] = (acc[p.status] ?? 0) + 1), acc), {});

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/portal/financial-years", label: "Financial Years" }, { label: year.label }]}
        title={
          <>
            {year.label} <Badge status={year.status} />
          </>
        }
        subtitle={`${fmtDate(year.startDate)} – ${fmtDate(year.endDate)} · Year dashboard`}
        actions={
          <>
            <ExportLinks report="financial-year" params={{ fy: String(id) }} label="Summary" />
            <PrintButton />
            {year.status !== "archived" ? (
              <FormDrawer label="Create project" title={`New project in ${year.label}`} fields={projectFields(lookups)} endpoint="/api/portal/projects" initial={{ financialYearId: id, status: "active" }} />
            ) : null}
          </>
        }
      />

      {year.status !== "open" ? (
        <div className={`pt-alert ${year.status === "archived" ? "info" : "warn"}`} style={{ marginBottom: "1rem" }}>
          {year.status === "closed" ? "This year is closed. Changes require a correction reason and are recorded in the audit log." : "This year is archived and read-only. Reopen it from Financial Years to make changes."}
        </div>
      ) : null}

      <nav className="pt-tabs" aria-label="Year workspace">
        {MODULES.map((m) => (
          <Link key={m.href} href={withFy(m.href)}>
            {m.label}
          </Link>
        ))}
      </nav>

      <Kpis>
        <Kpi label="Total expenditure" value={totals.recordedExpenditure} tone="navy" hint="Expenses + payroll" />
        <Kpi label="Project costs" value={totals.projectCosts} />
        <Kpi label="Office & admin" value={totals.officeCosts} tone="info" />
        <Kpi label="Materials" value={totals.materialsCosts} hint="Included in project/office" />
        <Kpi label="Payroll" value={totals.payrollNet} hint={`${formatINR(totals.payrollPaid, { whole: true })} paid`} />
        <Kpi label="Unpaid liabilities" value={totals.unpaidLiabilities} tone="warn" />
        <Kpi label="Received" value={totals.received} tone="success" hint={`${formatINR(totals.invoiced, { whole: true })} invoiced`} />
        <Kpi label="Outstanding receivables" value={totals.receivables} tone="danger" />
      </Kpis>

      {budget > 0 ? (
        <div className="pt-section">
          <Card title="Budget vs actual" sub={`${formatINR(spent, { whole: true })} of ${formatINR(budget, { whole: true })} (${((spent / budget) * 100).toFixed(1)}%)`}>
            <ProgressBar value={spent} max={budget} />
          </Card>
        </div>
      ) : null}

      <div className="pt-section pt-grid pt-grid-2">
        <Card title="Monthly spending">
          <MoneyBars
            data={trend.map((m) => ({ ...m, label: fmtMonth(`${m.month}-01`) }))}
            xKey="label"
            series={[
              { key: "project", label: "Project", stack: "s" },
              { key: "office", label: "Office", stack: "s" },
              { key: "payroll", label: "Payroll", stack: "s" },
              { key: "received", label: "Received", type: "line" },
            ]}
          />
        </Card>
        <Card title="Expense categories">
          <Donut data={categories} labelKey="category" valueKey="total" />
        </Card>
      </div>

      <div className="pt-section">
        <Card
          title="Project register"
          sub={Object.entries(statusCounts)
            .map(([s, n]) => `${n} ${s.replace("_", " ")}`)
            .join(" · ") || "No projects yet"}
          flush
          actions={<ExportLinks report="budget-vs-actual" params={{ fy: String(id) }} label="Register" />}
        >
          {register.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Project</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="num">Budget</th>
                    <th className="num">Cost this year</th>
                    <th className="num">Invoiced</th>
                    <th className="num">Received</th>
                    <th className="num">Contract value</th>
                  </tr>
                </thead>
                <tbody>
                  {register.rows.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">
                        <Link className="pt-link" href={`/portal/projects/${p.id}?fy=${id}`}>
                          {p.code}
                        </Link>
                      </td>
                      <td>
                        <div className="pt-cell-main">{p.name}</div>
                        {p.financialYearId !== id ? <div className="pt-cell-sub">Opened in {p.yearLabel}</div> : null}
                      </td>
                      <td>{p.customer ?? "—"}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                      <td className="num">{formatINR(p.budget)}</td>
                      <td className="num">
                        <strong>{formatINR(p.actualCost)}</strong>
                      </td>
                      <td className="num">{formatINR(p.invoiced)}</td>
                      <td className="num">{formatINR(p.received)}</td>
                      <td className="num muted">{formatINR(p.contractValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No projects in this year yet">Create a project to start recording its costs.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
