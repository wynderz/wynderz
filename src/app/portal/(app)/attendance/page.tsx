import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, fmtDateTime, fmtHours, fmtTime } from "@/components/portal/format";
import { Icon } from "@/components/portal/icons";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, Tabs } from "@/components/portal/ui";
import { addDays, isIsoDate, lastOfMonth, todayIso } from "@/lib/portal/dates";
import { attendanceFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { attendanceByEmployee, attendanceForDay, attendanceRecordsInRange, attendanceTotals, listImportJobs } from "@/lib/portal/services/attendance";
import { departments } from "@/lib/portal/services/employees";

export const metadata: Metadata = { title: "Attendance" };

const VIEWS = [
  ["daily", "Daily"],
  ["summary", "Employee summary"],
  ["records", "All records"],
  ["imports", "Import history"],
] as const;

export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { year } = await selectedYear(params);
  const view = VIEWS.some(([k]) => k === params.view) ? params.view! : "daily";
  const today = todayIso();
  const date = isIsoDate(params.date) ? params.date : today;

  // Range: explicit from/to > selected FY (capped at today) > current month.
  let from = isIsoDate(params.from) ? params.from : undefined;
  let to = isIsoDate(params.to) ? params.to : undefined;
  if (!from || !to) {
    if (year) {
      from = year.startDate;
      to = year.endDate < today ? year.endDate : today;
    } else {
      from = `${today.slice(0, 7)}-01`;
      to = lastOfMonth(today);
    }
  }
  if (to < from) to = from;
  const range = view === "daily" ? { from: date, to: date } : { from, to };
  const filters = { employeeId: params.employeeId ? Number(params.employeeId) : undefined, department: params.department };

  const [totals, lookups, depts] = await Promise.all([attendanceTotals(db, { ...range, ...filters }), loadLookups(db, ["employees"], { activeEmployees: true }), departments(db)]);
  const fields = attendanceFields(lookups);
  const href = (v: string) => `/portal/attendance?view=${v}${params.from ? `&from=${params.from}&to=${params.to}` : ""}`;

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Fingerprint device exports are imported by file (no direct device connection). Statuses follow the attendance policy in Settings; manual entries always take precedence over imported ones."
        actions={
          <>
            <ExportLinks report="attendance" params={{ from: range.from, to: range.to, ...(params.employeeId ? { employeeId: params.employeeId } : {}) }} />
            <FormDrawer label="Mark attendance" variant="secondary" title="Manual attendance entry" fields={fields} endpoint="/api/portal/attendance" initial={{ workDate: date, status: "present" }} />
            <Link className="pt-btn pt-btn-primary" href="/portal/attendance/import">
              <Icon name="upload" /> Import device file
            </Link>
          </>
        }
      />

      <Tabs tabs={VIEWS.map(([k, label]) => ({ key: k, label, href: href(k) }))} active={view} />

      <Kpis>
        <Kpi label="Active employees" value={totals.activeEmployees} money={false} tone="navy" />
        <Kpi label="Present" value={totals.present} money={false} tone="success" />
        <Kpi label="Absent" value={totals.absent} money={false} tone="danger" />
        <Kpi label="Late" value={totals.late} money={false} tone="warn" />
        <Kpi label="Half day" value={totals.halfDay} money={false} tone="warn" />
        <Kpi label="Leave" value={totals.leave} money={false} tone="info" />
        <Kpi label="Missing punch" value={totals.missingPunch} money={false} tone="warn" />
        <Kpi label="Hours worked" value={fmtHours(totals.workedMinutes)} money={false} hint={view === "daily" ? fmtDate(date) : `${fmtDate(range.from)} – ${fmtDate(range.to)}`} />
      </Kpis>

      <div className="pt-section">
        {view === "daily" ? <Daily date={date} fields={fields} /> : null}
        {view === "summary" ? (
          <Card flush title="Employee-wise summary" sub={`${fmtDate(range.from)} – ${fmtDate(range.to)}${year && !params.from ? ` (${year.label})` : ""}`}>
            <FilterBar
              fields={[
                { name: "from", label: "From", type: "date" },
                { name: "to", label: "To", type: "date" },
                { name: "department", label: "Department", type: "select", options: depts.map((d) => ({ value: d, label: d })) },
              ]}
            />
            <Summary range={range} department={params.department} />
          </Card>
        ) : null}
        {view === "records" ? (
          <Card flush title="Attendance records" sub={`${fmtDate(range.from)} – ${fmtDate(range.to)}`}>
            <FilterBar
              fields={[
                { name: "from", label: "From", type: "date" },
                { name: "to", label: "To", type: "date" },
                { name: "employeeId", label: "Employee", type: "select", options: (lookups.employees ?? []).map((e) => ({ value: String(e.id), label: e.name })) },
                { name: "department", label: "Department", type: "select", options: depts.map((d) => ({ value: d, label: d })) },
              ]}
            />
            <Records range={range} filters={filters} />
          </Card>
        ) : null}
        {view === "imports" ? <Imports /> : null}
      </div>
    </>
  );
}

async function Daily({ date, fields }: { date: string; fields: ReturnType<typeof attendanceFields> }) {
  const { db } = await requirePortal();
  const rows = await attendanceForDay(db, date);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <Card
      flush
      title={`Daily attendance · ${fmtDate(date)}`}
      sub={`${rows.filter((r) => !r.status).length} not marked`}
      actions={
        <>
          <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/attendance?view=daily&date=${prev}`}>
            ← {fmtDate(prev)}
          </Link>
          <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/attendance?view=daily&date=${todayIso()}`}>
            Today
          </Link>
          <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/attendance?view=daily&date=${next}`}>
            {fmtDate(next)} →
          </Link>
        </>
      }
    >
      <FilterBar fields={[{ name: "date", label: "Date", type: "date" }]} />
      {rows.length ? (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Status</th>
                <th>In</th>
                <th>Out</th>
                <th className="num">Hours</th>
                <th>Source</th>
                <th>Notes</th>
                <th className="actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>
                    <Link className="pt-link" href={`/portal/employees/${r.employeeId}`}>
                      {r.name}
                    </Link>
                    <div className="pt-cell-sub">{r.code}</div>
                  </td>
                  <td>{r.department ?? "—"}</td>
                  <td>
                    {r.status ? <Badge status={r.status} /> : <span className="muted">Not marked</span>} {r.isLate ? <Badge tone="warn">late</Badge> : null}
                  </td>
                  <td>{fmtTime(r.firstIn)}</td>
                  <td>{fmtTime(r.lastOut)}</td>
                  <td className="num">{r.workedMinutes === null ? "—" : fmtHours(r.workedMinutes)}</td>
                  <td className="muted">{r.source ?? ""}</td>
                  <td className="muted">{r.notes ?? ""}</td>
                  <td className="actions">
                    <FormDrawer
                      label={r.status ? "Edit" : "Mark"}
                      icon={r.status ? "edit" : "plus"}
                      variant="ghost"
                      size="sm"
                      title={`${r.name} · ${fmtDate(date)}`}
                      fields={fields}
                      endpoint="/api/portal/attendance"
                      initial={{ employeeId: r.employeeId, workDate: date, status: r.status ?? "present", firstIn: r.firstIn, lastOut: r.lastOut, notes: r.notes }}
                    />
                    {r.recordId ? <ActionButton label="Clear" icon="trash" method="DELETE" endpoint={`/api/portal/attendance/${r.recordId}`} confirm="Remove this attendance record?" successMessage="Record removed" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No employees yet">
          <Link className="pt-link" href="/portal/employees">
            Add employees
          </Link>{" "}
          before recording attendance.
        </Empty>
      )}
    </Card>
  );
}

async function Summary({ range, department }: { range: { from: string; to: string }; department?: string }) {
  const { db } = await requirePortal();
  const rows = await attendanceByEmployee(db, { ...range, department });
  if (!rows.length) return <Empty title="No attendance in this period" />;
  return (
    <div className="pt-table-wrap">
      <table className="pt-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th className="num">Present</th>
            <th className="num">Half day</th>
            <th className="num">Absent</th>
            <th className="num">Leave</th>
            <th className="num">Missing punch</th>
            <th className="num">Late</th>
            <th className="num">Hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeId}>
              <td>
                <Link className="pt-link" href={`/portal/attendance?view=records&employeeId=${r.employeeId}&from=${range.from}&to=${range.to}`}>
                  {r.name}
                </Link>
                <div className="pt-cell-sub">{r.code}</div>
              </td>
              <td>{r.department ?? "—"}</td>
              <td className="num">{r.present}</td>
              <td className="num">{r.halfDay}</td>
              <td className="num">{r.absent}</td>
              <td className="num">{r.leave}</td>
              <td className="num">{r.missingPunch}</td>
              <td className="num">{r.late}</td>
              <td className="num">{fmtHours(r.workedMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Records({ range, filters }: { range: { from: string; to: string }; filters: { employeeId?: number; department?: string } }) {
  const { db } = await requirePortal();
  const rows = await attendanceRecordsInRange(db, { ...range, ...filters });
  if (!rows.length) return <Empty title="No records in this period" />;
  const shown = rows.slice(0, 1000);
  return (
    <>
      {rows.length > shown.length ? <div className="pt-alert info" style={{ margin: "0.75rem 1rem" }}>Showing the first 1,000 of {rows.length.toLocaleString("en-IN")} records. Export to see all.</div> : null}
      <div className="pt-table-wrap">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Status</th>
              <th>In</th>
              <th>Out</th>
              <th className="num">Hours</th>
              <th>Source</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">
                  <Link className="pt-link" href={`/portal/attendance?view=daily&date=${r.workDate}`}>
                    {fmtDate(r.workDate)}
                  </Link>
                </td>
                <td>{r.name}</td>
                <td>
                  <Badge status={r.status} /> {r.isLate ? <Badge tone="warn">late</Badge> : null}
                </td>
                <td>{fmtTime(r.firstIn)}</td>
                <td>{fmtTime(r.lastOut)}</td>
                <td className="num">{r.workedMinutes === null ? "—" : fmtHours(r.workedMinutes)}</td>
                <td className="muted">{r.source}</td>
                <td className="muted">{r.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Imports() {
  const { db } = await requirePortal();
  const jobs = await listImportJobs(db, "attendance");
  return (
    <Card flush title="Import history" sub="Every upload is kept privately with its results">
      {jobs.length ? (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Uploaded</th>
                <th>File</th>
                <th>Status</th>
                <th>Period</th>
                <th className="num">Rows</th>
                <th className="num">New days</th>
                <th className="num">Updated</th>
                <th className="num">Skipped</th>
                <th className="num">Errors</th>
                <th className="actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="nowrap">{fmtDateTime(j.createdAt)}</td>
                  <td>{j.fileName}</td>
                  <td>
                    <Badge status={j.status === "completed" ? "completed" : j.status === "failed" ? "cancelled" : "pending"}>{j.status === "previewed" ? "not confirmed" : j.status}</Badge>
                  </td>
                  <td className="nowrap">{j.periodStart ? `${fmtDate(j.periodStart)} – ${fmtDate(j.periodEnd)}` : "—"}</td>
                  <td className="num">{j.totalRows}</td>
                  <td className="num">{j.importedRows}</td>
                  <td className="num">{j.updatedRows}</td>
                  <td className="num">{j.skippedRows}</td>
                  <td className="num">{j.errorRows}</td>
                  <td className="actions">
                    {j.documentId ? (
                      <a className="pt-btn pt-btn-ghost pt-btn-sm" href={`/api/portal/documents/${j.documentId}/file`}>
                        Original file
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No imports yet">
          <Link className="pt-link" href="/portal/attendance/import">
            Import a device file
          </Link>
        </Empty>
      )}
    </Card>
  );
}
