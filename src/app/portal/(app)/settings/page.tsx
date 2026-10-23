import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionButton, EntityForm, FormDrawer, type Field } from "@/components/portal/forms";
import { labelize } from "@/components/portal/format";
import { SettingsForm } from "@/components/portal/SettingsForm";
import { Badge, Card, Empty, PageHeader } from "@/components/portal/ui";
import { categoryFields } from "@/lib/portal/fields";
import { requirePortal } from "@/lib/portal/page";
import { listCategories } from "@/lib/portal/services/categories";
import { getAllSettings } from "@/lib/portal/services/settings";

export const metadata: Metadata = { title: "Settings" };

const MONTH_OPTIONS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((label, i) => ({ value: String(i + 1), label }));

const passwordFields: Field[] = [
  { name: "currentPassword", label: "Current password", type: "password", required: true },
  { name: "newPassword", label: "New password", type: "password", required: true, help: "At least 10 characters, with letters and numbers. Your other sessions will be signed out." },
];

const companyFields: Field[] = [
  { name: "name", label: "Company name", type: "text", required: true, help: "Printed on reports and exports." },
  { name: "gstin", label: "GSTIN", type: "text" },
  { name: "address", label: "Registered address", type: "textarea" },
  { name: "currency", label: "Currency", type: "text", readOnly: true, help: "All amounts are recorded in Indian Rupees." },
];

const financialYearFields: Field[] = [
  { name: "startMonth", label: "Financial year starts in", type: "select", required: true, options: MONTH_OPTIONS, help: "India: April. Used when creating new financial years." },
];

const payrollFields: Field[] = [
  {
    name: "workingDaysMode",
    label: "Working days per month",
    type: "select",
    required: true,
    options: [
      { value: "calendar", label: "Calendar days in the month (28–31)" },
      { value: "fixed", label: "Fixed number every month" },
    ],
  },
  { name: "fixedWorkingDays", label: "Fixed working days", type: "number", min: "1", max: "31", step: "1", help: "Used only when the mode is “fixed”, e.g. 26.", showIf: { field: "workingDaysMode", in: ["fixed"] } },
  { name: "prorateByDaysPaid", label: "Prorate monthly salaries by days paid", type: "checkbox", span: 2, help: "Off: monthly employees always receive their full salary regardless of days paid." },
];

const attendanceFields: Field[] = [
  { name: "shiftStart", label: "Shift start", type: "time", required: true, help: "Arrivals after shift start + grace are marked late." },
  { name: "graceMinutes", label: "Grace (minutes)", type: "number", min: "0", max: "240", step: "1" },
  { name: "halfDayMinHours", label: "Half-day minimum hours", type: "number", min: "0", max: "24", step: "0.25" },
  { name: "fullDayMinHours", label: "Full-day minimum hours", type: "number", min: "0", max: "24", step: "0.25" },
  {
    name: "punchPolicy",
    label: "Punch policy",
    type: "select",
    required: true,
    options: [
      { value: "first_last", label: "First punch in, last punch out" },
      { value: "pairs", label: "Sum each in/out pair" },
    ],
  },
  { name: "duplicatePunchMinutes", label: "Duplicate punch window (minutes)", type: "number", min: "0", max: "60", step: "1" },
  { name: "dayCutoff", label: "Day cutoff (night shifts)", type: "time", required: true, help: "00:00 disables. Punches before this time count for the previous day." },
];

const uploadFields: Field[] = [{ name: "maxMb", label: "Maximum upload size (MB)", type: "number", min: "1", max: "50", step: "1", help: "Applies to bills, receipts and documents. 1–50 MB." }];

function Explain({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="pt-dl" style={{ marginBottom: "1.1rem" }}>
      {items.map(([term, text]) => (
        <div key={term} style={{ display: "contents" }}>
          <dt>{term}</dt>
          <dd style={{ margin: 0 }}>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function SettingsPage() {
  const { db, session } = await requirePortal();
  const [settings, categories] = await Promise.all([getAllSettings(db), listCategories(db)]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, company details and the business rules used by payroll and attendance. Every change is recorded in the audit log." />

      <div className="pt-section" id="account">
        <Card title="Your account" sub={`Signed in as ${session.user.name} · ${session.user.email}`}>
          <div style={{ maxWidth: "40rem" }}>
            <EntityForm fields={passwordFields} endpoint="/api/portal/auth/password" submitLabel="Change password" />
          </div>
        </Card>
      </div>

      <div className="pt-section pt-grid pt-grid-2">
        <Card title="Company" sub="Name and identifiers shown on printed reports and Excel exports.">
          <SettingsForm settingKey="company" fields={companyFields} initial={settings.company} />
        </Card>

        <Card title="Financial year" sub="Defines how years are split for reporting.">
          <Explain items={[["Start month", "Each financial year runs 12 months from this month. Existing years keep their own start and end dates."]]} />
          <SettingsForm settingKey="financialYear" fields={financialYearFields} initial={settings.financialYear} />
        </Card>
      </div>

      <div className="pt-section">
        <Card title="Payroll" sub="How monthly salaries are calculated.">
          <Explain
            items={[
              ["Working days", "Monthly salary is divided by the working days in the month to get a per-day rate. “Calendar” uses the actual days in that month (28–31); “Fixed” uses the same number every month (e.g. 26)."],
              ["Proration", "When on, a monthly employee earns salary × days paid ÷ working days (full salary if days paid is left blank). When off, monthly employees receive the full salary regardless of days paid. Daily-rate employees are always paid daily rate × days paid."],
            ]}
          />
          <SettingsForm settingKey="payroll" fields={payrollFields} initial={settings.payroll} />
        </Card>
      </div>

      <div className="pt-section">
        <Card title="Attendance" sub="How biometric punches become present, late, half-day or absent.">
          <Explain
            items={[
              ["Shift start & grace", "An employee whose first punch is after shift start plus the grace minutes is marked late."],
              ["Half / full day", "Worked hours at or above the full-day minimum count as present; at or above the half-day minimum (but below full-day) count as a half day; below that the day is absent. Half-day hours cannot exceed full-day hours."],
              ["Punch policy", "“First / last”: the first punch of the day is IN and the last is OUT, and everything in between is ignored. “Pairs”: punches are paired in order (in, out, in, out…) and each pair's time is added, so breaks are excluded. A single punch, or an odd number of punches under “pairs”, is flagged as a missing punch."],
              ["Duplicate window", "Punches closer together than this many minutes are treated as one (an accidental double scan)."],
              ["Day cutoff", "For night shifts: punches before this time of day belong to the previous date, so a shift from 22:00 to 06:00 is one day. Leave 00:00 to disable."],
              ["Weekly off days", "Days ticked here are marked as weekly off rather than absent."],
            ]}
          />
          <SettingsForm settingKey="attendance" fields={attendanceFields} initial={settings.attendance} weekdays={{ name: "weeklyOffDays", label: "Weekly off days", help: "Tick every day that is a regular weekly holiday." }} />
        </Card>
      </div>

      <div className="pt-section">
        <Card title="Uploads" sub="Limits for bills, receipts and document attachments.">
          <SettingsForm settingKey="uploads" fields={uploadFields} initial={settings.uploads} />
        </Card>
      </div>

      <div className="pt-section" id="categories">
        <Card
          flush
          title="Categories"
          sub="Expense categories group spending in reports; the reporting bucket decides whether it counts as project, office, travel, machine or purchase cost. Material categories group items in Materials & Spares. System categories are required by the portal and can be renamed but not deleted."
          actions={<FormDrawer label="Add category" title="New category" fields={categoryFields} endpoint="/api/portal/categories" initial={{ type: "expense", kind: "other", isActive: true }} />}
        >
          {categories.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Reporting bucket</th>
                    <th>Status</th>
                    <th>System</th>
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.type === "expense" ? "Expense" : "Material"}</td>
                      <td>
                        <div className="pt-cell-main">{c.name}</div>
                      </td>
                      <td>{labelize(c.kind)}</td>
                      <td>
                        <Badge status={c.isActive ? "active" : "inactive"} />
                      </td>
                      <td>{c.isSystem ? <Badge tone="info">System</Badge> : <span className="muted">—</span>}</td>
                      <td className="actions">
                        <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit category ${c.name}`} fields={categoryFields} endpoint={`/api/portal/categories/${c.id}`} method="PATCH" initial={c} />
                        {c.isSystem ? null : (
                          <ActionButton label="Delete" icon="trash" variant="danger" endpoint={`/api/portal/categories/${c.id}`} method="DELETE" confirm={`Delete category “${c.name}”? Categories already used by records cannot be deleted — deactivate them instead.`} successMessage="Category deleted" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No categories yet">Add a category to start classifying expenses and materials.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
