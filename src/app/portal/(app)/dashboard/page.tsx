import type { Metadata } from "next";
import Link from "next/link";
import { Donut, HBars, MoneyBars } from "@/components/portal/charts";
import { FilterBar } from "@/components/portal/FilterBar";
import { fmtMonth, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader } from "@/components/portal/ui";
import { PrintButton } from "@/components/portal/forms";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { categoryBreakdown, financeTotals, monthlyTrend, topProjects, yearComparison } from "@/lib/portal/queries/finance";

export const metadata: Metadata = { title: "Master Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year, years } = await selectedYear(params);
  const filter = { fy, from: params.from, to: params.to };

  const [totals, comparison, trend, categories, top] = await Promise.all([
    financeTotals(db, filter),
    yearComparison(db),
    monthlyTrend(db, filter),
    categoryBreakdown(db, filter),
    topProjects(db, filter, 8),
  ]);

  const scope = year ? year.label : "All financial years";
  const budget = year ? totals.yearBudget : comparison.reduce((a, y) => a + Number(y.budget), 0);

  if (!years.length) {
    return (
      <>
        <PageHeader title="Master Dashboard" subtitle="Company-wide finance and operations." />
        <Card>
          <Empty title="No financial years yet">
            <p>Create your first financial year to start recording projects, expenses and payroll.</p>
            <Link href="/portal/financial-years" className="pt-btn pt-btn-primary">
              Create a financial year
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Master Dashboard"
        subtitle={`${scope}${params.from || params.to ? ` · ${params.from ?? "…"} to ${params.to ?? "…"}` : ""}. Paid, unpaid, invoiced and received amounts are shown separately — contract value is never treated as collected revenue.`}
        actions={
          <>
            <ExportLinks report="master" params={params} label="Year summary" />
            <PrintButton />
          </>
        }
      />

      <div className="pt-card pt-flush pt-no-print" style={{ marginBottom: "1rem" }}>
        <FilterBar
          fields={[
            { name: "from", label: "From", type: "date" },
            { name: "to", label: "To", type: "date" },
          ]}
        />
      </div>

      <Kpis>
        <Kpi label="Total recorded expenditure" value={totals.recordedExpenditure} hint="Expenses + payroll" tone="navy" />
        <Kpi label="Project expenditure" value={totals.projectCosts} />
        <Kpi label="Office / admin expenditure" value={totals.officeCosts} tone="info" />
        <Kpi label="Materials & spares" value={totals.materialsCosts} hint="Included in project/office" />
        <Kpi label="Payroll (net payable)" value={totals.payrollNet} hint={`${formatINR(totals.payrollPaid, { whole: true })} paid`} />
        <Kpi label="Unpaid liabilities" value={totals.unpaidLiabilities} tone="warn" hint={`${formatINR(totals.paidExpenditure, { whole: true })} paid`} />
        <Kpi label="Project contract value" value={totals.contractValue} hint="Agreed, not collected" tone="navy" />
        <Kpi label="Invoiced" value={totals.invoiced} tone="info" />
        <Kpi label="Recorded receipts" value={totals.received} tone="success" />
        <Kpi label="Outstanding receivables" value={totals.receivables} tone="danger" />
        <Kpi label="Active projects" value={`${totals.activeProjects} / ${totals.projects}`} money={false} />
        <Kpi label="Employees" value={`${totals.activeEmployees} active`} money={false} hint={`${totals.employees} on record`} />
      </Kpis>

      <div className="pt-section">
        <Card title="Financial year comparison" sub="Each row is a financial-year record. Open a year for its own dashboard." flush>
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Financial year</th>
                  <th>Status</th>
                  <th className="num">Projects</th>
                  <th className="num">Project costs</th>
                  <th className="num">Office costs</th>
                  <th className="num">Payroll</th>
                  <th className="num">Total expenditure</th>
                  <th className="num">Budget</th>
                  <th className="num">Received</th>
                </tr>
              </thead>
              <tbody>
                {[...comparison].reverse().map((y) => (
                  <tr key={y.id} style={y.id === fy ? { background: "var(--pt-lime-soft)" } : undefined}>
                    <td>
                      <Link className="pt-link" href={`/portal/financial-years/${y.id}`}>
                        {y.label}
                      </Link>
                    </td>
                    <td>
                      <Badge status={y.status} />
                    </td>
                    <td className="num">{y.projects}</td>
                    <td className="num">{formatINR(y.projectCosts)}</td>
                    <td className="num">{formatINR(y.officeCosts)}</td>
                    <td className="num">{formatINR(y.payroll)}</td>
                    <td className="num">
                      <strong>{formatINR(y.totalExpenditure)}</strong>
                    </td>
                    <td className="num muted">{Number(y.budget) ? formatINR(y.budget) : "—"}</td>
                    <td className="num">{formatINR(y.received)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="pt-section pt-grid pt-grid-2">
        <Card title="Year-wise expenditure" sub="Project, office and payroll per financial year">
          <MoneyBars
            data={comparison.map((y) => ({ year: y.label, projectCosts: y.projectCosts, officeCosts: y.officeCosts, payroll: y.payroll, received: y.received }))}
            xKey="year"
            series={[
              { key: "projectCosts", label: "Project", stack: "s" },
              { key: "officeCosts", label: "Office", stack: "s" },
              { key: "payroll", label: "Payroll", stack: "s" },
              { key: "received", label: "Received", type: "line" },
            ]}
          />
        </Card>
        <Card title="Budget vs actual" sub={budget ? `Budget ${formatINR(budget, { whole: true })}` : "Set a budget on each financial year to compare"}>
          <MoneyBars
            data={comparison.map((y) => ({ year: y.label, budget: y.budget, actual: y.totalExpenditure }))}
            xKey="year"
            series={[
              { key: "budget", label: "Budget" },
              { key: "actual", label: "Actual" },
            ]}
          />
        </Card>
        <Card title="Monthly expense trend" sub="Recorded spending and receipts by month">
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
        <Card title="Expense categories" sub="Share of recorded expenses" actions={<Link className="pt-btn pt-btn-ghost pt-btn-sm" href="/portal/reports/categories">Details</Link>}>
          <Donut data={categories} labelKey="category" valueKey="total" />
        </Card>
      </div>

      <div className="pt-section">
        <Card title="Top projects by spending" actions={<Link className="pt-btn pt-btn-ghost pt-btn-sm" href="/portal/reports/budget-vs-actual">Budget vs actual</Link>}>
          {top.length ? (
            <HBars data={top.map((p) => ({ label: p.code, actual: p.actual, budget: p.budget }))} labelKey="label" valueKey="actual" secondaryKey="budget" secondaryLabel="Budget" />
          ) : (
            <Empty title="No project spending recorded yet" />
          )}
        </Card>
      </div>
    </>
  );
}
