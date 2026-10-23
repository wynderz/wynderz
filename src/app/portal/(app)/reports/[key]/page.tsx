import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilterBar, type FilterField } from "@/components/portal/FilterBar";
import { PrintButton } from "@/components/portal/forms";
import { fmtDate, fmtDateTime, formatINR, formatNumber } from "@/components/portal/format";
import { Card, Empty, ExportLinks, PageHeader } from "@/components/portal/ui";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { getReport, reportFilter, type ReportFilter } from "@/lib/portal/reports";
import { getAllSettings } from "@/lib/portal/services/settings";

const SCREEN_LIMIT = 2000;

type ColType = "money" | "date" | "number" | "text" | undefined;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const report = getReport(key);
  return { title: report ? report.title : "Report" };
}

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "";
}

/** Formats a cell on the server; the client never receives the column value functions. */
function formatCell(v: unknown, type: ColType): string {
  if (isEmpty(v)) return "";
  if (type === "money") return formatINR(v as string | number);
  if (type === "date") return fmtDate(v instanceof Date ? v : String(v));
  if (type === "number") return typeof v === "number" || typeof v === "string" ? formatNumber(v) : String(v);
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  // Enum-like values (e.g. "partially_paid") read better without underscores.
  if (typeof v === "string") return /^[a-z]+(_[a-z]+)+$/.test(v) ? v.replace(/_/g, " ") : v;
  return String(v);
}

export default async function ReportPage({ params: routeParams, searchParams }: { params: Promise<{ key: string }>; searchParams: SearchParams }) {
  const { key } = await routeParams;
  const report = getReport(key);
  if (!report) notFound();

  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);

  const parsed = reportFilter.safeParse({ ...params, fy });
  const filter: ReportFilter = parsed.success ? parsed.data : { fy };
  const want = new Set(report.filters);
  const categoryKind = key === "materials" ? "materialCategories" : "expenseCategories";

  const [result, lookups, settings] = await Promise.all([
    report.run(db, filter),
    loadLookups(db, [...(want.has("project") ? (["projects"] as const) : []), ...(want.has("category") ? ([categoryKind] as const) : []), ...(want.has("employee") ? (["employees"] as const) : [])]),
    getAllSettings(db),
  ]);

  const fields: FilterField[] = [];
  if (want.has("project")) fields.push({ name: "projectId", label: "Project", type: "select", options: (lookups.projects ?? []).map((p) => ({ value: String(p.id), label: `${p.code} · ${p.name}` })) });
  if (want.has("category")) fields.push({ name: "categoryId", label: "Category", type: "select", options: (lookups[categoryKind] ?? []).map((c) => ({ value: String(c.id), label: c.name })) });
  if (want.has("employee")) fields.push({ name: "employeeId", label: "Employee", type: "select", options: (lookups.employees ?? []).map((e) => ({ value: String(e.id), label: `${e.name} (${e.employeeCode})` })) });
  if (want.has("range")) fields.push({ name: "from", label: "From", type: "date" }, { name: "to", label: "To", type: "date" });

  // Human-readable scope for the subtitle and the printed header.
  const scopeParts: string[] = [];
  if (want.has("fy")) scopeParts.push(year ? `FY ${year.label}` : "All financial years");
  else scopeParts.push("All financial years");
  if (want.has("range") && (filter.from || filter.to)) scopeParts.push(`${filter.from ? fmtDate(filter.from) : "start"} – ${filter.to ? fmtDate(filter.to) : "today"}`);
  if (want.has("project") && filter.projectId) {
    const p = lookups.projects?.find((x) => x.id === filter.projectId);
    scopeParts.push(`Project ${p ? p.code : `#${filter.projectId}`}`);
  }
  if (want.has("category") && filter.categoryId) {
    const c = lookups[categoryKind]?.find((x) => x.id === filter.categoryId);
    scopeParts.push(`Category ${c ? c.name : `#${filter.categoryId}`}`);
  }
  if (want.has("employee") && filter.employeeId) {
    const e = lookups.employees?.find((x) => x.id === filter.employeeId);
    scopeParts.push(e ? e.name : `Employee #${filter.employeeId}`);
  }
  const scope = scopeParts.join(" · ");

  const columns = result.columns.map((c) => ({ header: c.header, type: c.type as ColType }));
  const shown = result.rows.length > SCREEN_LIMIT ? result.rows.slice(0, SCREEN_LIMIT) : result.rows;
  const body = shown.map((row) => result.columns.map((c) => formatCell(c.value(row), c.type)));
  const totals = result.totals ? result.columns.map((c) => formatCell(c.value(result.totals!), c.type)) : null;
  const alignRight = (t: ColType) => t === "money" || t === "number";

  const exportParams: Record<string, string> = { ...params };
  if (fy) exportParams.fy = String(fy);
  else delete exportParams.fy;

  return (
    <>
      <div className="pt-print-only" style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{settings.company.name || "WYNDERZ Pvt. Ltd."}</div>
        <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>{report.title}</div>
        <div>{scope}</div>
        <div style={{ fontSize: "0.8rem" }}>Generated {fmtDateTime(new Date())}</div>
      </div>

      <PageHeader
        title={report.title}
        crumbs={[{ href: "/portal/reports", label: "Reports" }, { label: report.title }]}
        subtitle={`${report.description} · ${scope}`}
        actions={
          <>
            <ExportLinks report={key} params={exportParams} />
            <PrintButton />
          </>
        }
      />

      {!parsed.success ? (
        <div className="pt-alert warn pt-no-print" role="alert" style={{ marginBottom: "1rem" }}>
          Some filters in the address were invalid and have been ignored.
        </div>
      ) : null}

      <div className="pt-section">
        <Card flush>
          {fields.length ? <FilterBar fields={fields} /> : null}
          {result.note ? (
            <div className="pt-alert info" style={{ margin: "0.75rem 1rem" }}>
              {result.note}
            </div>
          ) : null}
          {result.rows.length > SCREEN_LIMIT ? (
            <div className="pt-alert warn" style={{ margin: "0.75rem 1rem" }}>
              Showing the first {SCREEN_LIMIT.toLocaleString("en-IN")} of {result.rows.length.toLocaleString("en-IN")} rows on screen. The Excel / CSV export contains every row.
            </div>
          ) : null}
          {body.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    {columns.map((c, i) => (
                      <th key={i} className={alignRight(c.type) ? "num" : undefined}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((cells, r) => (
                    <tr key={r}>
                      {cells.map((v, i) => (
                        <td key={i} className={alignRight(columns[i].type) ? "num" : columns[i].type === "date" ? "nowrap" : undefined}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {totals ? (
                  <tfoot>
                    <tr>
                      {totals.map((v, i) => (
                        <td key={i} className={alignRight(columns[i].type) ? "num" : undefined}>
                          <strong>{v}</strong>
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : (
            <Empty title="No data for this report">Change the filters or the financial year in the top bar.</Empty>
          )}
          <div className="pt-summary-bar">
            <span>
              Rows <strong>{result.rows.length.toLocaleString("en-IN")}</strong>
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
