import type { Metadata } from "next";
import { FilterBar } from "@/components/portal/FilterBar";
import { fmtDateTime, labelize, type Tone } from "@/components/portal/format";
import { Badge, Card, Empty, PageHeader, Pagination } from "@/components/portal/ui";
import { readParams, requirePortal, type SearchParams } from "@/lib/portal/page";
import { auditFacets, listAudit, listUsers } from "@/lib/portal/services/users";

export const metadata: Metadata = { title: "Audit Log" };

const BASE = "/portal/audit-log";

function actionTone(action: string): Tone {
  if (action === "delete" || action === "deactivate" || action === "login_denied") return "danger";
  if (action === "create" || action === "activate" || action === "restore") return "success";
  if (action === "update" || action === "archive") return "warn";
  if (action.includes("password") || action === "login" || action === "logout") return "info";
  return "";
}

function hasChanges(v: unknown) {
  if (v === null || v === undefined) return false;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  // The audit log is not year-scoped: drop the global year selector.
  const { fy: _fy, ...query } = params;
  void _fy;
  const [data, facets, users] = await Promise.all([listAudit(db, query), auditFacets(db), listUsers(db)]);

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Read-only record of every sign-in, change, correction and deletion, newest first. Entries cannot be edited or removed." />

      <div className="pt-section">
        <Card flush>
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search", placeholder: "Summary, email, record id…" },
              { name: "entity", label: "Record type", type: "select", options: facets.entities.map((e) => ({ value: e, label: labelize(e) })) },
              { name: "action", label: "Action", type: "select", options: facets.actions.map((a) => ({ value: a, label: labelize(a) })) },
              { name: "userId", label: "Admin", type: "select", options: users.map((u) => ({ value: String(u.id), label: u.email })) },
              { name: "from", label: "From", type: "date" },
              { name: "to", label: "To", type: "date" },
            ]}
          />
          {data.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Record</th>
                    <th>Summary</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td>{r.userEmail ?? <span className="muted">system</span>}</td>
                      <td>
                        <Badge tone={actionTone(r.action)}>{labelize(r.action)}</Badge>
                      </td>
                      <td className="nowrap">
                        {labelize(r.entity)}
                        {r.entityId ? <span className="muted"> #{r.entityId}</span> : null}
                      </td>
                      <td className="wrap">
                        <div>{r.summary ?? <span className="muted">—</span>}</div>
                        {hasChanges(r.changes) ? (
                          <details>
                            <summary className="pt-cell-sub">Show changes</summary>
                            <pre className="pt-mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "0.4rem 0 0", fontSize: "0.78rem" }}>
                              {JSON.stringify(r.changes, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                      <td className="nowrap muted">{r.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No audit entries match these filters">Change or clear the filters above.</Empty>
          )}
          <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </Card>
      </div>
    </>
  );
}
