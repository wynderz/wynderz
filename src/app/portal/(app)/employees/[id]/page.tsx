import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormDrawer } from "@/components/portal/forms";
import { fmtDate, fmtHours, fmtMonth, formatINR, formatNumber } from "@/components/portal/format";
import { Badge, Card, Empty, Kpi, Kpis, PageHeader } from "@/components/portal/ui";
import { firstOfMonth, lastOfMonth, monthLabel, todayIso } from "@/lib/portal/dates";
import { AppError } from "@/lib/portal/errors";
import { employeeFields } from "@/lib/portal/fields";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { attendanceByEmployee } from "@/lib/portal/services/attendance";
import { getEmployee } from "@/lib/portal/services/employees";
import { listPayroll } from "@/lib/portal/services/payroll";
import { timesheetSummary } from "@/lib/portal/services/timesheets";

export const metadata: Metadata = { title: "Employee" };

async function loadEmployee(db: Parameters<typeof getEmployee>[0], id: number) {
  try {
    return await getEmployee(db, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}

export default async function EmployeeDetailPage({ params: routeParams, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const { id: rawId } = await routeParams;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);

  const emp = await loadEmployee(db, id);

  const today = todayIso();
  const from = year ? year.startDate : firstOfMonth(today);
  const to = year ? year.endDate : lastOfMonth(today);
  const scope = year ? year.label : monthLabel(today);

  const [attendanceRows, payroll, hoursByProject] = await Promise.all([
    attendanceByEmployee(db, { from, to, employeeId: id }),
    listPayroll(db, { employeeId: id, pageSize: 12, ...(fy ? { fy } : {}) }),
    timesheetSummary(db, { employeeId: id, from, to }, "project"),
  ]);
  const att = attendanceRows[0];
  const totalMinutes = hoursByProject.reduce((a, r) => a + Number(r.minutes ?? 0), 0);
  const ps = payroll.summary;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/portal/employees", label: "Employees" }, { label: emp.employeeCode }]}
        title={
          <>
            {emp.name} <Badge status={emp.status} />
          </>
        }
        subtitle={`${[emp.designation, emp.department].filter(Boolean).join(" · ") || "No department"} · employee record only (no portal login)`}
        actions={<FormDrawer label="Edit" icon="edit" variant="secondary" title={`Edit ${emp.name}`} fields={employeeFields} endpoint={`/api/portal/employees/${emp.id}`} method="PATCH" initial={emp} />}
      />

      <div className="pt-grid pt-grid-2">
        <Card title="Profile">
          <dl className="pt-dl">
            <dt>Employee ID</dt>
            <dd className="pt-mono">{emp.employeeCode}</dd>
            <dt>Device user ID</dt>
            <dd>{emp.deviceUserId ?? "—"}</dd>
            <dt>Department</dt>
            <dd>{emp.department ?? "—"}</dd>
            <dt>Designation</dt>
            <dd>{emp.designation ?? "—"}</dd>
            <dt>Joining date</dt>
            <dd>{fmtDate(emp.joiningDate)}</dd>
            <dt>Exit date</dt>
            <dd>{fmtDate(emp.exitDate)}</dd>
            <dt>Pay type</dt>
            <dd>{emp.payType === "daily" ? "Daily wage" : "Monthly salary"}</dd>
            <dt>{emp.payType === "daily" ? "Daily rate" : "Monthly salary"}</dt>
            <dd>{formatINR(emp.payType === "daily" ? emp.dailyRate : emp.monthlySalary)}</dd>
            <dt>Phone</dt>
            <dd>{emp.phone ?? "—"}</dd>
            <dt>Email</dt>
            <dd>{emp.email ?? "—"}</dd>
            <dt>Address</dt>
            <dd>{emp.address ?? "—"}</dd>
            {emp.notes ? (
              <>
                <dt>Notes</dt>
                <dd>{emp.notes}</dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card title={`Attendance · ${scope}`} sub={`${fmtDate(from)} – ${fmtDate(to)}`}>
          {att ? (
            <Kpis>
              <Kpi label="Present" value={att.present} money={false} tone="success" />
              <Kpi label="Half days" value={att.halfDay} money={false} tone="warn" />
              <Kpi label="Absent" value={att.absent} money={false} tone="danger" />
              <Kpi label="Leave" value={att.leave} money={false} tone="info" />
              <Kpi label="Missing punch" value={att.missingPunch} money={false} tone="warn" />
              <Kpi label="Late" value={att.late} money={false} />
              <Kpi label="Worked hours" value={fmtHours(att.workedMinutes)} money={false} tone="navy" />
            </Kpis>
          ) : (
            <Empty title="No attendance in this period" />
          )}
        </Card>
      </div>

      <div className="pt-section">
        <Card
          flush
          title={`Payroll · ${year ? year.label : "most recent"}`}
          sub={`Net ${formatINR(ps.net)} · paid ${formatINR(ps.paid)} · advances ${formatINR(ps.advance)}`}
          actions={
            <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/payroll?view=records&employeeId=${emp.id}`}>
              All payroll →
            </Link>
          }
        >
          {payroll.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Days paid</th>
                    <th className="num">Earned</th>
                    <th className="num">Deductions</th>
                    <th className="num">Advance</th>
                    <th className="num">Net</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtMonth(r.periodMonth)}</td>
                      <td className="num">
                        {r.daysPaid !== null ? formatNumber(r.daysPaid) : "—"}
                        {r.workingDays ? <span className="muted"> / {r.workingDays}</span> : null}
                      </td>
                      <td className="num">{formatINR(r.earnedSalary)}</td>
                      <td className="num muted">{Number(r.deductions) ? formatINR(r.deductions) : "—"}</td>
                      <td className="num muted">{Number(r.advance) ? formatINR(r.advance) : "—"}</td>
                      <td className="num">
                        <strong>{formatINR(r.netPayable)}</strong>
                      </td>
                      <td className="num">{formatINR(r.amountPaid)}</td>
                      <td>
                        <Badge status={r.paymentStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No payroll records in this period" />
          )}
        </Card>
      </div>

      <div className="pt-section">
        <Card
          flush
          title={`Timesheet hours · ${scope}`}
          sub={`${fmtHours(totalMinutes)} h total`}
          actions={
            <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/timesheets?employeeId=${emp.id}&from=${from}&to=${to}`}>
              View entries →
            </Link>
          }
        >
          {hoursByProject.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="num">Entries</th>
                    <th className="num">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursByProject.map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className="num">{r.entries}</td>
                      <td className="num">{fmtHours(r.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No timesheet entries in this period" />
          )}
        </Card>
      </div>
    </>
  );
}
