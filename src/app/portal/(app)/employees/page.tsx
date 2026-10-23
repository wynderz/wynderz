import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, PageHeader, Pagination, SortTh } from "@/components/portal/ui";
import { employeeFields } from "@/lib/portal/fields";
import { readParams, requirePortal, type SearchParams } from "@/lib/portal/page";
import { departments, listEmployees } from "@/lib/portal/services/employees";

export const metadata: Metadata = { title: "Employees" };

const BASE = "/portal/employees";

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const [data, depts] = await Promise.all([listEmployees(db, params), departments(db)]);

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Employee records for attendance, timesheets and payroll. Employees are records only — they never get portal logins."
        actions={<FormDrawer label="Add employee" title="New employee" fields={employeeFields} endpoint="/api/portal/employees" initial={{ status: "active", payType: "monthly" }} />}
      />

      <div className="pt-section">
        <Card flush>
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search", placeholder: "Name, code, device ID, phone…" },
              { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
              { name: "department", label: "Department", type: "select", options: depts.map((d) => ({ value: d, label: d })) },
            ]}
          />
          {data.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <SortTh label="Code" sortKey="code" base={BASE} params={params} />
                    <SortTh label="Name" sortKey="name" base={BASE} params={params} />
                    <th>Device ID</th>
                    <SortTh label="Department / designation" sortKey="department" base={BASE} params={params} />
                    <SortTh label="Joined" sortKey="joiningDate" base={BASE} params={params} />
                    <th>Pay type</th>
                    <th className="num">Salary / rate</th>
                    <th>Status</th>
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap pt-mono">{r.employeeCode}</td>
                      <td>
                        <Link className="pt-link" href={`${BASE}/${r.id}`}>
                          {r.name}
                        </Link>
                        {r.phone ? <div className="pt-cell-sub">{r.phone}</div> : null}
                      </td>
                      <td>{r.deviceUserId ?? <span className="muted">—</span>}</td>
                      <td>
                        <div className="pt-cell-main">{r.department ?? <span className="muted">—</span>}</div>
                        {r.designation ? <div className="pt-cell-sub">{r.designation}</div> : null}
                      </td>
                      <td className="nowrap">{fmtDate(r.joiningDate)}</td>
                      <td>{r.payType === "daily" ? "Daily wage" : "Monthly"}</td>
                      <td className="num">
                        {r.payType === "daily" ? (
                          <>
                            {formatINR(r.dailyRate)}
                            <div className="pt-cell-sub">per day</div>
                          </>
                        ) : (
                          <>
                            {formatINR(r.monthlySalary)}
                            <div className="pt-cell-sub">per month</div>
                          </>
                        )}
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td className="actions">
                        <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit ${r.name}`} fields={employeeFields} endpoint={`/api/portal/employees/${r.id}`} method="PATCH" initial={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No employees match these filters">Add an employee or change the filters above.</Empty>
          )}
          <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </Card>
      </div>
    </>
  );
}
