import type { Metadata } from "next";
import { ActionButton, FormDrawer, type Field } from "@/components/portal/forms";
import { fmtDate, fmtDateTime } from "@/components/portal/format";
import { Badge, Card, Empty, PageHeader } from "@/components/portal/ui";
import { requirePortal } from "@/lib/portal/page";
import { listUsers } from "@/lib/portal/services/users";

export const metadata: Metadata = { title: "Admin Accounts" };

const PASSWORD_HELP = "At least 10 characters, with letters and numbers.";

const createFields: Field[] = [
  { name: "name", label: "Full name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "password", label: "Initial password", type: "password", required: true, help: PASSWORD_HELP },
];

const editFields: Field[] = [
  { name: "name", label: "Full name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
];

const resetFields: Field[] = [{ name: "newPassword", label: "New password", type: "password", required: true, help: `${PASSWORD_HELP} The admin is signed out everywhere.` }];

export default async function AdminsPage() {
  const { db, session } = await requirePortal();
  const users = await listUsers(db);
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <>
      <PageHeader
        title="Admin Accounts"
        subtitle="People who can sign in to this portal."
        actions={<FormDrawer label="Add admin" title="New admin account" fields={createFields} endpoint="/api/portal/users" />}
      />

      <div className="pt-alert info" style={{ marginBottom: "1rem" }}>
        Every active account has identical, full access to all modules. There are no roles, no employee logins and no public registration — new admins can only be added here. Deactivated accounts cannot sign in but keep their history. The last active admin cannot be deactivated or deleted, and accounts with activity history can only be deactivated, not deleted.
      </div>

      <div className="pt-section">
        <Card flush>
          {users.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th>Created</th>
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isMe = u.id === session.user.id;
                    const isLastActive = u.isActive && activeCount <= 1;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="pt-cell-main">
                            {u.name} {isMe ? <Badge tone="lime">You</Badge> : null}
                          </div>
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <Badge status={u.isActive ? "active" : "inactive"} />
                        </td>
                        <td className="nowrap">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="muted">Never</span>}</td>
                        <td className="nowrap">{fmtDate(u.createdAt)}</td>
                        <td className="actions">
                          <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit ${u.name}`} fields={editFields} endpoint={`/api/portal/users/${u.id}`} method="PATCH" initial={{ name: u.name, email: u.email }} />
                          <FormDrawer label="Reset password" icon="shield" variant="ghost" size="sm" title={`Reset password for ${u.name}`} fields={resetFields} endpoint={`/api/portal/users/${u.id}/password`} submitLabel="Set password" />
                          {u.isActive ? (
                            isLastActive ? null : (
                              <ActionButton
                                label="Deactivate"
                                icon="archive"
                                endpoint={`/api/portal/users/${u.id}/active`}
                                body={{ isActive: false }}
                                confirm={isMe ? "Deactivate your own account? You will be signed out immediately." : `Deactivate ${u.email}? They will be signed out and cannot sign in.`}
                                successMessage="Admin deactivated"
                              />
                            )
                          ) : (
                            <ActionButton label="Activate" icon="restore" endpoint={`/api/portal/users/${u.id}/active`} body={{ isActive: true }} confirm={`Re-activate ${u.email}? They will regain full access.`} successMessage="Admin activated" />
                          )}
                          {isMe || isLastActive ? null : (
                            <ActionButton
                              label="Delete"
                              icon="trash"
                              variant="danger"
                              endpoint={`/api/portal/users/${u.id}`}
                              method="DELETE"
                              confirm={`Permanently delete ${u.email}? Only possible for accounts with no activity history.`}
                              successMessage="Admin deleted"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No admin accounts" />
          )}
        </Card>
      </div>
    </>
  );
}
