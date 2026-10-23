import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, PageHeader, ProgressBar } from "@/components/portal/ui";
import { yearFields } from "@/lib/portal/fields";
import { requirePortal } from "@/lib/portal/page";
import { yearComparison } from "@/lib/portal/queries/finance";
import { suggestNextYear } from "@/lib/portal/services/financial-years";

export const metadata: Metadata = { title: "Financial Years" };

export default async function FinancialYearsPage() {
  const { db } = await requirePortal();
  const [years, suggestion] = await Promise.all([yearComparison(db), suggestNextYear(db)]);

  return (
    <>
      <PageHeader
        title="Financial Years"
        subtitle="Each financial year is a record (April–March by default). Creating one instantly gives it a dashboard, project register, expenses, materials, payroll, attendance, timesheets, documents and reports — no new tables or files."
        actions={<FormDrawer label="Create financial year" title="Create financial year" fields={yearFields} endpoint="/api/portal/financial-years" initial={suggestion} submitLabel="Create year" />}
      />

      {years.length === 0 ? (
        <Card>
          <Empty title="No financial years yet">
            Suggested first year: <strong>{suggestion.label}</strong> ({fmtDate(suggestion.startDate)} – {fmtDate(suggestion.endDate)}).
          </Empty>
        </Card>
      ) : (
        <div className="pt-year-cards">
          {[...years].reverse().map((y) => {
            const budget = Number(y.budget);
            const spent = Number(y.totalExpenditure);
            return (
              <Card
                key={y.id}
                title={
                  <Link href={`/portal/financial-years/${y.id}`} className="pt-link" style={{ fontSize: "1.1rem" }}>
                    {y.label}
                  </Link>
                }
                sub={`${fmtDate(y.startDate)} – ${fmtDate(y.endDate)}`}
                actions={<Badge status={y.status} />}
              >
                <dl className="pt-dl" style={{ marginBottom: "0.8rem" }}>
                  <dt>Projects</dt>
                  <dd>{y.projects}</dd>
                  <dt>Project costs</dt>
                  <dd>{formatINR(y.projectCosts)}</dd>
                  <dt>Office & admin</dt>
                  <dd>{formatINR(y.officeCosts)}</dd>
                  <dt>Payroll</dt>
                  <dd>{formatINR(y.payroll)}</dd>
                  <dt>Total expenditure</dt>
                  <dd>{formatINR(y.totalExpenditure)}</dd>
                  <dt>Received</dt>
                  <dd>{formatINR(y.received)}</dd>
                </dl>
                {budget > 0 ? (
                  <div style={{ marginBottom: "0.8rem" }}>
                    <div className="pt-help" style={{ marginBottom: "0.25rem" }}>
                      {((spent / budget) * 100).toFixed(0)}% of {formatINR(budget, { whole: true })} budget
                    </div>
                    <ProgressBar value={spent} max={budget} />
                  </div>
                ) : null}
                <div className="pt-actions">
                  <Link href={`/portal/financial-years/${y.id}`} className="pt-btn pt-btn-primary pt-btn-sm">
                    Open year
                  </Link>
                  {y.status !== "archived" ? (
                    <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit ${y.label}`} fields={yearFields} endpoint={`/api/portal/financial-years/${y.id}`} method="PATCH" initial={y} />
                  ) : null}
                  {y.status === "open" ? (
                    <ActionButton label="Close year" endpoint={`/api/portal/financial-years/${y.id}/status`} body={{ status: "closed" }} confirm={`Close ${y.label}? Records will be protected; changes will need a correction reason.`} successMessage={`${y.label} closed`} />
                  ) : (
                    <ActionButton label="Reopen" endpoint={`/api/portal/financial-years/${y.id}/status`} body={{ status: "open" }} askReason={`Why is ${y.label} being reopened?`} successMessage={`${y.label} reopened`} />
                  )}
                  {y.status === "closed" ? (
                    <ActionButton label="Archive" icon="archive" endpoint={`/api/portal/financial-years/${y.id}/status`} body={{ status: "archived" }} confirm={`Archive ${y.label}? It becomes read-only until reopened.`} successMessage={`${y.label} archived`} />
                  ) : null}
                  {y.projects === 0 && spent === 0 && Number(y.invoiced) === 0 && Number(y.received) === 0 ? (
                    <ActionButton label="Delete" icon="trash" variant="danger" method="DELETE" endpoint={`/api/portal/financial-years/${y.id}`} confirm={`Delete the empty year ${y.label}?`} successMessage="Year deleted" />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="pt-section">
        <Card title="How year states work">
          <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--pt-text-2)" }}>
            <li>
              <strong>Open</strong> — normal day-to-day entry.
            </li>
            <li>
              <strong>Closed</strong> — protected. Admins can still correct records, but must give a reason that is stored in the audit log.
            </li>
            <li>
              <strong>Archived</strong> — read-only until reopened. Historical data stays visible in every dashboard and report.
            </li>
            <li>Every transaction is placed in the year that contains its date, so a project can run across several years without being duplicated.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
