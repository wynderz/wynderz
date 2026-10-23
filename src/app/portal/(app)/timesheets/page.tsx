import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, fmtHours, fmtMonth, fmtTime } from "@/components/portal/format";
import { Icon } from "@/components/portal/icons";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, Pagination, SortTh } from "@/components/portal/ui";
import { todayIso } from "@/lib/portal/dates";
import { timesheetFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { listTimesheets, timesheetSummary } from "@/lib/portal/services/timesheets";

export const metadata: Metadata = { title: "Timesheets" };

const BASE = "/portal/timesheets";

type SummaryRow = { key: string; minutes: number; entries: number; people: number };

function SummaryCard({ title, rows, label, month }: { title: string; rows: SummaryRow[]; label: string; month?: boolean }) {
  const shown = rows.slice(0, 12);
  return (
    <Card flush title={title} sub={rows.length > shown.length ? `Top ${shown.length} of ${rows.length}` : undefined}>
      {shown.length ? (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>{label}</th>
                <th className="num">Entries</th>
                <th className="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td className="wrap">{month ? fmtMonth(r.key) : r.key}</td>
                  <td className="num">{r.entries}</td>
                  <td className="num">{fmtHours(r.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No hours yet" />
      )}
    </Card>
  );
}

export default async function TimesheetsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);
  const query = { ...params, fy };
  const [data, byProject, byEmployee, byMonth, lookups] = await Promise.all([
    listTimesheets(db, query),
    timesheetSummary(db, query, "project"),
    timesheetSummary(db, query, "employee"),
    timesheetSummary(db, query, "month"),
    loadLookups(db, ["employees", "projects"]),
  ]);
  const fields = timesheetFields(lookups);
  const s = data.summary;

  return (
    <>
      <PageHeader
        title="Timesheets"
        subtitle={`${year ? year.label : "All years"} · hours worked per employee and project. Hours are end − start − break; no overtime rules are applied.`}
        actions={
          <>
            <ExportLinks report="timesheets" params={{ ...params, ...(fy ? { fy: String(fy) } : {}) }} />
            <Link className="pt-btn pt-btn-secondary" href={`${BASE}/import`}>
              <Icon name="upload" /> Import Excel/CSV
            </Link>
            <FormDrawer label="Add entry" title="New timesheet entry" fields={fields} endpoint="/api/portal/timesheets" initial={{ workDate: todayIso(), status: "submitted", breakMinutes: "0" }} preview="timesheet" />
          </>
        }
      />

      <Kpis>
        <Kpi label="Total hours (filtered)" value={fmtHours(s.minutes)} money={false} tone="navy" />
        <Kpi label="Entries" value={s.total.toLocaleString("en-IN")} money={false} tone="info" />
        <Kpi label="Employees" value={byEmployee.length} money={false} />
        <Kpi label="Projects" value={byProject.filter((p) => p.key !== "No project").length} money={false} />
      </Kpis>

      <div className="pt-section pt-grid pt-grid-3">
        <SummaryCard title="Hours by project" label="Project" rows={byProject} />
        <SummaryCard title="Hours by employee" label="Employee" rows={byEmployee} />
        <SummaryCard title="Hours by month" label="Month" rows={byMonth} month />
      </div>

      <div className="pt-section">
        <Card flush>
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search", placeholder: "Task, employee, project…" },
              { name: "employeeId", label: "Employee", type: "select", options: (lookups.employees ?? []).map((e) => ({ value: String(e.id), label: `${e.name} (${e.employeeCode})` })) },
              { name: "projectId", label: "Project", type: "select", options: (lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.code })) },
              { name: "status", label: "Status", type: "select", options: ["draft", "submitted", "approved", "rejected"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
              { name: "from", label: "From", type: "date" },
              { name: "to", label: "To", type: "date" },
            ]}
          />
          {data.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <SortTh label="Date" sortKey="date" base={BASE} params={params} />
                    <SortTh label="Employee" sortKey="employee" base={BASE} params={params} />
                    <SortTh label="Project" sortKey="project" base={BASE} params={params} />
                    <th>Task</th>
                    <th>Time</th>
                    <th className="num">Break</th>
                    <SortTh label="Hours" sortKey="hours" base={BASE} params={params} className="num" />
                    <th>Status</th>
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDate(r.workDate)}</td>
                      <td>
                        <Link className="pt-link" href={`/portal/employees/${r.employeeId}`}>
                          {r.employeeName}
                        </Link>
                        <div className="pt-cell-sub">{r.employeeCode}</div>
                      </td>
                      <td>
                        {r.projectId ? (
                          <Link className="pt-link" href={`/portal/projects/${r.projectId}`} title={r.projectName ?? undefined}>
                            {r.projectCode}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="wrap">
                        <div className="pt-cell-main">{r.task}</div>
                        {r.notes || r.source === "import" ? (
                          <div className="pt-cell-sub">
                            {r.source === "import" ? "imported" : ""}
                            {r.source === "import" && r.notes ? " · " : ""}
                            {r.notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="nowrap">{r.startTime && r.endTime ? `${fmtTime(r.startTime)}–${fmtTime(r.endTime)}` : <span className="muted">hours only</span>}</td>
                      <td className="num muted">{r.breakMinutes ? `${r.breakMinutes}m` : "—"}</td>
                      <td className="num">
                        <strong>{fmtHours(r.totalMinutes)}</strong>
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td className="actions">
                        <FormDrawer
                          label="Edit"
                          icon="edit"
                          variant="ghost"
                          size="sm"
                          title={`Edit timesheet #${r.id}`}
                          fields={fields}
                          endpoint={`/api/portal/timesheets/${r.id}`}
                          method="PATCH"
                          initial={{ ...r, hours: r.startTime && r.endTime ? "" : (r.totalMinutes / 60).toFixed(2) }}
                          preview="timesheet"
                        />
                        <ActionButton label="Delete" icon="trash" method="DELETE" endpoint={`/api/portal/timesheets/${r.id}`} confirm={`Delete this timesheet entry (${r.employeeName}, ${fmtDate(r.workDate)})?`} successMessage="Timesheet entry deleted" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No timesheet entries match these filters">Add an entry, import a file, or change the filters above.</Empty>
          )}
          <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </Card>
      </div>
    </>
  );
}
