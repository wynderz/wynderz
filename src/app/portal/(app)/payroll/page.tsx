import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { GeneratePayroll } from "@/components/portal/GeneratePayroll";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { compactINR, fmtMonth, formatINR, formatNumber } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, Pagination, SortTh, Tabs } from "@/components/portal/ui";
import { shortMonth, todayIso } from "@/lib/portal/dates";
import { paymentFields, payrollFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { subMoney } from "@/lib/portal/money";
import { readParams, requirePortal, selectedYear, withParams, type SearchParams } from "@/lib/portal/page";
import { annualGrid, listPayroll } from "@/lib/portal/services/payroll";

export const metadata: Metadata = { title: "Payroll" };

const BASE = "/portal/payroll";

const METRIC_LABEL = { net: "Net payable", paid: "Amount paid", gross: "Gross salary" } as const;

export default async function PayrollPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year, years } = await selectedYear(params);
  const view = params.view === "annual" ? "annual" : "records";
  const lookups = await loadLookups(db, ["employees"]);
  const fields = payrollFields(lookups);
  const keepFy: Record<string, string> = params.fy ? { fy: params.fy } : {};

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle={`${year ? year.label : "All years"} · monthly salary and daily-wage payroll, payments and advances.`}
        actions={
          <>
            <ExportLinks report="payroll" params={{ ...params, ...(fy ? { fy: String(fy) } : {}) }} />
            <GeneratePayroll defaultMonth={todayIso().slice(0, 7)} />
            <FormDrawer label="Add payroll" title="New payroll record" fields={fields} endpoint="/api/portal/payroll" initial={{ periodMonth: todayIso().slice(0, 7) }} />
          </>
        }
      />

      <div className="pt-alert info" style={{ marginBottom: "1rem" }}>
        <strong>How net pay is calculated:</strong> monthly staff earn salary × days paid ÷ working days; daily-wage staff earn daily rate × days paid. Allowances and attendance adjustments are added, then deductions and advances recovered are subtracted. Working-days and proration policy are configurable in{" "}
        <Link className="pt-link" href="/portal/settings">
          Settings
        </Link>
        .
      </div>

      <Tabs
        active={view}
        tabs={[
          { key: "records", label: "Monthly records", href: withParams(BASE, keepFy, { view: "records" }) },
          { key: "annual", label: "Annual grid", href: withParams(BASE, keepFy, { view: "annual" }) },
        ]}
      />

      {view === "annual" ? (
        <AnnualView db={db} params={params} fy={fy} years={years} />
      ) : (
        <RecordsView db={db} params={params} fy={fy} fields={fields} lookups={lookups} />
      )}
    </>
  );
}

type Db = Awaited<ReturnType<typeof requirePortal>>["db"];

async function RecordsView({ db, params, fy, fields, lookups }: { db: Db; params: Record<string, string>; fy?: number; fields: ReturnType<typeof payrollFields>; lookups: Awaited<ReturnType<typeof loadLookups>> }) {
  const data = await listPayroll(db, { ...params, fy });
  const s = data.summary;

  return (
    <>
      <Kpis>
        <Kpi label="Gross (filtered)" value={s.gross} tone="navy" hint={`${s.total.toLocaleString("en-IN")} records`} />
        <Kpi label="Net payable" value={s.net} tone="info" />
        <Kpi label="Paid" value={s.paid} tone="success" />
        <Kpi label="Outstanding" value={subMoney(s.net, s.paid)} tone="warn" />
        <Kpi label="Advances recovered" value={s.advance} />
      </Kpis>

      <div className="pt-section">
        <Card flush>
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search", placeholder: "Employee name or code…" },
              { name: "employeeId", label: "Employee", type: "select", options: (lookups.employees ?? []).map((e) => ({ value: String(e.id), label: `${e.name} (${e.employeeCode})` })) },
              { name: "month", label: "Month", type: "month" },
              { name: "paymentStatus", label: "Payment", type: "select", options: [{ value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" }] },
            ]}
          />
          {data.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <SortTh label="Month" sortKey="month" base={BASE} params={params} />
                    <SortTh label="Employee" sortKey="employee" base={BASE} params={params} />
                    <th>Pay type</th>
                    <th className="num">Salary / rate</th>
                    <th className="num">Days paid</th>
                    <th className="num">Earned</th>
                    <th className="num">Allowances</th>
                    <th className="num">Deductions</th>
                    <th className="num">Advance</th>
                    <SortTh label="Net" sortKey="net" base={BASE} params={params} className="num" />
                    <th className="num">Paid</th>
                    <SortTh label="Status" sortKey="status" base={BASE} params={params} />
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const adj = Number(r.attendanceAdjustment);
                    return (
                      <tr key={r.id}>
                        <td className="nowrap">
                          {fmtMonth(r.periodMonth)}
                          <div className="pt-cell-sub">{r.yearLabel}</div>
                        </td>
                        <td>
                          <Link className="pt-link" href={`/portal/employees/${r.employeeId}`}>
                            {r.employeeName}
                          </Link>
                          <div className="pt-cell-sub">{r.employeeCode}</div>
                        </td>
                        <td>{r.payType === "daily" ? "Daily" : "Monthly"}</td>
                        <td className="num">
                          {formatINR(r.baseSalary)}
                          <div className="pt-cell-sub">{r.payType === "daily" ? "per day" : "per month"}</div>
                        </td>
                        <td className="num nowrap">
                          {r.daysPaid !== null ? formatNumber(r.daysPaid) : "full"}
                          {r.workingDays ? <span className="muted"> / {r.workingDays}</span> : null}
                        </td>
                        <td className="num">{formatINR(r.earnedSalary)}</td>
                        <td className="num muted">
                          {Number(r.allowances) ? formatINR(r.allowances) : "—"}
                          {adj ? <div className="pt-cell-sub">adj. {formatINR(r.attendanceAdjustment)}</div> : null}
                        </td>
                        <td className="num muted">{Number(r.deductions) ? formatINR(r.deductions) : "—"}</td>
                        <td className="num muted">{Number(r.advance) ? formatINR(r.advance) : "—"}</td>
                        <td className="num">
                          <strong>{formatINR(r.netPayable)}</strong>
                        </td>
                        <td className="num">
                          {formatINR(r.amountPaid)}
                          {r.paymentStatus === "partial" ? <div className="pt-cell-sub">due {formatINR(r.outstanding)}</div> : null}
                        </td>
                        <td>
                          <Badge status={r.paymentStatus} />
                        </td>
                        <td className="actions">
                          <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit payroll · ${r.employeeName} · ${fmtMonth(r.periodMonth)}`} fields={fields} endpoint={`/api/portal/payroll/${r.id}`} method="PATCH" initial={{ ...r, periodMonth: r.periodMonth.slice(0, 7) }} />
                          {r.paymentStatus !== "paid" ? (
                            <FormDrawer
                              label="Record payment"
                              icon="money"
                              variant="ghost"
                              size="sm"
                              title={`Payment · ${r.employeeName} · ${fmtMonth(r.periodMonth)}`}
                              fields={paymentFields}
                              endpoint={`/api/portal/payroll/${r.id}/payment`}
                              initial={{ amountPaid: r.netPayable, paymentDate: r.paymentDate ?? todayIso(), paymentMethod: r.paymentMethod }}
                              intro={
                                <p className="pt-help" style={{ marginTop: 0 }}>
                                  Net payable {formatINR(r.netPayable)} · already paid {formatINR(r.amountPaid)}. Enter the total paid so far, not just this instalment.
                                </p>
                              }
                            />
                          ) : null}
                          {Number(r.amountPaid) === 0 ? (
                            <ActionButton label="Delete" icon="trash" method="DELETE" endpoint={`/api/portal/payroll/${r.id}`} confirm={`Delete the ${fmtMonth(r.periodMonth)} payroll record for ${r.employeeName}?`} successMessage="Payroll record deleted" />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No payroll records match these filters">Generate a month, add a record, or change the filters above.</Empty>
          )}
          <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </Card>
      </div>
    </>
  );
}

async function AnnualView({ db, params, fy, years }: { db: Db; params: Record<string, string>; fy?: number; years: Array<{ startDate: string; endDate: string }> }) {
  const mode = params.mode === "calendar" ? "calendar" : "fy";
  const metric = params.metric === "paid" || params.metric === "gross" ? params.metric : "net";
  const currentYear = Number(todayIso().slice(0, 4));
  const yearParam = Number(params.year);
  const calYear = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : currentYear;

  const present = new Set<number>([currentYear - 1, currentYear, currentYear + 1, calYear]);
  for (const y of years) {
    present.add(Number(y.startDate.slice(0, 4)));
    present.add(Number(y.endDate.slice(0, 4)));
  }
  const yearList = [...present].sort((a, b) => b - a);

  const grid = await annualGrid(db, { mode, metric, ...(mode === "calendar" ? { year: calYear } : fy ? { fy } : {}) });

  return (
    <div className="pt-section">
      <Card flush title={`${grid.title} · ${METRIC_LABEL[metric]}`} sub={mode === "fy" ? "Uses the financial year selected in the top bar (latest year when “All years” is selected). Click a cell to open that month’s records." : "Click a cell to open that month’s records."}>
        <FilterBar
          fields={[
            { name: "mode", label: "Period", type: "select", allLabel: "Financial year", options: [{ value: "calendar", label: "Calendar year" }] },
            ...(mode === "calendar" ? [{ name: "year", label: "Year", type: "select" as const, allLabel: `Current (${currentYear})`, options: yearList.map((y) => ({ value: String(y), label: String(y) })) }] : []),
            { name: "metric", label: "Show", type: "select", allLabel: "Net payable", options: [{ value: "paid", label: "Amount paid" }, { value: "gross", label: "Gross salary" }] },
          ]}
        />
        {grid.rows.length ? (
          <div className="pt-table-wrap">
            <table className="pt-table pt-grid-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  {grid.months.map((m) => (
                    <th key={m} className="num" title={fmtMonth(m)}>
                      {shortMonth(m)}
                      <div className="pt-cell-sub">{m.slice(2, 4)}</div>
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td className="nowrap">
                      <Link className="pt-link" href={`/portal/employees/${r.employeeId}`}>
                        {r.name}
                      </Link>
                      <div className="pt-cell-sub">{r.code}</div>
                    </td>
                    {grid.months.map((m) => {
                      const c = r.cells[m];
                      return (
                        <td key={m} className="num nowrap">
                          {c ? (
                            <Link href={withParams(BASE, {}, { view: "records", employeeId: r.employeeId, month: m.slice(0, 7), fy: "all" })} title={`${r.name} · ${fmtMonth(m)} · ${formatINR(c.value)} · ${c.status}`} className={c.status === "paid" ? undefined : "muted"}>
                              {compactINR(c.value)}
                            </Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="num nowrap">
                      <strong title={formatINR(r.total)}>{compactINR(r.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  {grid.months.map((m) => (
                    <td key={m} className="num nowrap" title={formatINR(grid.totals[m])}>
                      {Number(grid.totals[m]) ? compactINR(grid.totals[m]) : "—"}
                    </td>
                  ))}
                  <td className="num nowrap">
                    <strong title={formatINR(grid.grandTotal)}>{formatINR(grid.grandTotal, { whole: true })}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty title="No payroll in this period">Generate payroll from the Monthly records tab, or choose another year.</Empty>
        )}
      </Card>
    </div>
  );
}
