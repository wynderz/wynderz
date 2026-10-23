import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Donut, MoneyBars } from "@/components/portal/charts";
import { ActionButton, FormDrawer, PrintButton } from "@/components/portal/forms";
import { fmtDate, fmtHours, fmtMonth, formatINR, formatNumber } from "@/components/portal/format";
import { Badge, Card, Empty, Kpi, Kpis, PageHeader, ProgressBar, Tabs } from "@/components/portal/ui";
import { getDb } from "@/lib/portal/db";
import { todayIso } from "@/lib/portal/dates";
import { expenseFields, invoiceFields, materialFields, projectFields, receiptFields, timesheetFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, type SearchParams } from "@/lib/portal/page";
import { supplierSpending } from "@/lib/portal/queries/finance";
import { listDocuments } from "@/lib/portal/services/documents";
import { listExpenses } from "@/lib/portal/services/expenses";
import { listMaterials } from "@/lib/portal/services/materials";
import { getProjectDashboard, projectReceivables } from "@/lib/portal/services/projects";
import { listTimesheets, timesheetSummary } from "@/lib/portal/services/timesheets";
import { REPORTS } from "@/lib/portal/reports";

export const metadata: Metadata = { title: "Project" };

const TABS = [
  ["overview", "Overview"],
  ["expenses", "Expenses"],
  ["materials", "Materials & Spares"],
  ["purchases", "Purchase Records"],
  ["suppliers", "Suppliers"],
  ["receivables", "Invoices & Receipts"],
  ["timesheets", "Timesheets"],
  ["documents", "Documents"],
  ["analysis", "Cost Analysis"],
  ["reports", "Reports"],
] as const;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await readParams(searchParams);
  const fy = sp.fy && sp.fy !== "all" ? Number(sp.fy) : undefined;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";

  const dash = await getProjectDashboard(db, id, fy).catch((e: { status?: number }) => {
    if (e?.status === 404) return null;
    throw e;
  });
  if (!dash) notFound();
  const { project: p, money } = dash;
  const lookups = await loadLookups(db, ["years", "projects", "suppliers", "expenseCategories", "materialCategories", "employees", "invoices"]);
  const href = (t: string) => `/portal/projects/${id}?tab=${t}${fy ? `&fy=${fy}` : ""}`;
  const scope = fy ? lookups.years?.find((y) => y.id === fy)?.label : "All years";
  const readOnly = !!p.archivedAt;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/portal/financial-years", label: "Financial Years" }, { href: `/portal/financial-years/${p.financialYearId}`, label: p.yearLabel ?? "" }, { href: "/portal/projects", label: "Projects" }, { label: p.code }]}
        title={
          <>
            {p.name} <Badge status={p.status} />
            {p.archivedAt ? <Badge tone="">archived</Badge> : null}
          </>
        }
        subtitle={`${p.code}${p.customer ? ` · ${p.customer}` : ""}${p.poReference ? ` · PO ${p.poReference}` : ""} · Figures: ${scope}`}
        actions={
          <>
            <PrintButton />
            {!readOnly ? <FormDrawer label="Edit project" icon="edit" variant="secondary" title={`Edit ${p.code}`} fields={projectFields(lookups)} endpoint={`/api/portal/projects/${id}`} method="PATCH" initial={p} /> : null}
            <ActionButton
              label={readOnly ? "Restore" : "Archive"}
              icon={readOnly ? "restore" : "archive"}
              variant="ghost"
              size="md"
              endpoint={`/api/portal/projects/${id}/archive`}
              body={{ archived: !readOnly }}
              confirm={readOnly ? undefined : "Archive this project? Its records stay in reports; it will be hidden from pickers."}
              successMessage={readOnly ? "Project restored" : "Project archived"}
            />
          </>
        }
      />

      <div className="pt-actions pt-no-print" style={{ marginBottom: "0.75rem" }}>
        <span className="pt-help">Show figures for:</span>
        <Link className={`pt-btn pt-btn-sm ${!fy ? "pt-btn-primary" : "pt-btn-ghost"}`} href={`/portal/projects/${id}?tab=${tab}`}>
          All years
        </Link>
        {dash.byYear.map((y) => (
          <Link key={y.fyId} className={`pt-btn pt-btn-sm ${fy === y.fyId ? "pt-btn-primary" : "pt-btn-ghost"}`} href={`/portal/projects/${id}?tab=${tab}&fy=${y.fyId}`}>
            {y.year}
          </Link>
        ))}
      </div>

      <Tabs tabs={TABS.map(([k, label]) => ({ key: k, label, href: href(k) }))} active={tab} />

      {tab === "overview" ? (
        <>
          <Kpis>
            <Kpi label="Budget" value={p.budget} tone="navy" hint={money.budgetRemaining ? `${formatINR(money.budgetRemaining, { whole: true })} remaining` : "No budget set"} />
            <Kpi label="Actual cost" value={money.actualCost} hint={`${formatINR(money.paidCost, { whole: true })} paid`} />
            <Kpi label="Materials cost" value={money.materialsCost} />
            <Kpi label="Other project expenses" value={money.otherCost} />
            <Kpi label="Planned materials (estimate)" value={dash.materialPlan.planned} tone="info" hint={`Est. total ${formatINR(money.estimatedTotalCost, { whole: true })}`} />
            <Kpi label="Unpaid to vendors" value={money.outstandingPayables} tone="warn" />
            <Kpi label="Contract value" value={p.contractValue} tone="navy" hint="Agreed — not collected" />
            <Kpi label="Invoiced" value={money.invoiced} tone="info" />
            <Kpi label="Received" value={money.received} tone="success" />
            <Kpi label="Receivable" value={money.receivable} tone="danger" />
            <Kpi label="Estimated balance" value={money.estimatedBalance} hint="Contract value − actual cost" />
            <Kpi label="Logged hours" value={fmtHours(dash.timesheetMinutes)} money={false} hint={`${dash.documentCount} documents`} />
          </Kpis>
          <div className="pt-section pt-grid pt-grid-2">
            <Card title="Project details">
              <dl className="pt-dl">
                <dt>Code</dt>
                <dd>{p.code}</dd>
                <dt>Customer</dt>
                <dd>{p.customer ?? "—"}</dd>
                <dt>PO / contract</dt>
                <dd>{p.poReference ?? "—"}</dd>
                <dt>Manager</dt>
                <dd>{p.managerName ?? "—"}</dd>
                <dt>Opened in</dt>
                <dd>{p.yearLabel}</dd>
                <dt>Start</dt>
                <dd>{fmtDate(p.startDate)}</dd>
                <dt>Expected completion</dt>
                <dd>{fmtDate(p.expectedEndDate)}</dd>
                <dt>Actual completion</dt>
                <dd>{fmtDate(p.actualEndDate)}</dd>
                <dt>Description</dt>
                <dd style={{ fontWeight: 400 }}>{p.description ?? "—"}</dd>
                <dt>Notes</dt>
                <dd style={{ fontWeight: 400 }}>{p.notes ?? "—"}</dd>
              </dl>
              {Number(p.budget) > 0 ? (
                <div style={{ marginTop: "1rem" }}>
                  <div className="pt-help" style={{ marginBottom: "0.25rem" }}>
                    Budget used: {((Number(money.actualCost) / Number(p.budget)) * 100).toFixed(1)}%
                  </div>
                  <ProgressBar value={Number(money.actualCost)} max={Number(p.budget)} />
                </div>
              ) : null}
            </Card>
            <Card title="Cost by category">
              <Donut data={dash.byCategory} labelKey="category" valueKey="total" />
            </Card>
          </div>
        </>
      ) : null}

      {tab === "expenses" ? <ExpensesTab projectId={id} fy={fy} readOnly={readOnly} lookups={lookups} /> : null}
      {tab === "materials" ? <MaterialsTab projectId={id} fy={fy} readOnly={readOnly} lookups={lookups} purchasedOnly={false} /> : null}
      {tab === "purchases" ? <MaterialsTab projectId={id} fy={fy} readOnly={readOnly} lookups={lookups} purchasedOnly /> : null}
      {tab === "suppliers" ? <SuppliersTab projectId={id} fy={fy} /> : null}
      {tab === "receivables" ? <ReceivablesTab projectId={id} readOnly={readOnly} lookups={lookups} /> : null}
      {tab === "timesheets" ? <TimesheetsTab projectId={id} fy={fy} lookups={lookups} /> : null}
      {tab === "documents" ? <DocumentsTab projectId={id} /> : null}

      {tab === "analysis" ? (
        <div className="pt-grid pt-grid-2">
          <Card title="Monthly cost">
            <MoneyBars data={dash.byMonth.map((m) => ({ label: fmtMonth(m.month), total: m.total }))} xKey="label" series={[{ key: "total", label: "Cost" }]} />
          </Card>
          <Card title="Cost by financial year" sub="One project, costs split by the year each transaction falls in">
            <MoneyBars data={dash.byYear.map((y) => ({ year: y.year, total: y.total }))} xKey="year" series={[{ key: "total", label: "Cost" }]} />
          </Card>
          <Card title="Budget vs actual vs contract">
            <MoneyBars
              data={[{ label: p.code, budget: p.budget ?? "0", actual: money.actualCost, estimate: money.estimatedTotalCost, contract: p.contractValue ?? "0" }]}
              xKey="label"
              series={[
                { key: "budget", label: "Budget" },
                { key: "actual", label: "Actual" },
                { key: "estimate", label: "Actual + planned" },
                { key: "contract", label: "Contract value" },
              ]}
            />
          </Card>
          <Card title="Category breakdown" flush>
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Total</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {dash.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="num">{formatINR(c.total)}</td>
                    <td className="num muted">{Number(money.actualCost) ? `${((Number(c.total) / Number(money.actualCost)) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "reports" ? (
        <Card title="Reports for this project" sub="Each report opens pre-filtered to this project; export to Excel/CSV or print from there.">
          <div className="pt-grid pt-grid-3">
            {REPORTS.filter((r) => r.filters.includes("project")).map((r) => (
              <Link key={r.key} href={`/portal/reports/${r.key}?projectId=${id}${fy ? `&fy=${fy}` : ""}`} className="pt-card pt-year-card">
                <div className="pt-cell-main">{r.title}</div>
                <div className="pt-cell-sub">{r.description}</div>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}

type L = Awaited<ReturnType<typeof loadLookups>>;

async function ExpensesTab({ projectId, fy, readOnly, lookups }: { projectId: number; fy?: number; readOnly: boolean; lookups: L }) {
  const data = await listExpenses(getDb(), { projectId, fy, pageSize: 200 });
  const fields = expenseFields(lookups);
  return (
    <Card
      flush
      title={`Expenses (${data.total})`}
      sub={`Total ${formatINR(data.summary.sumTotal)} · paid ${formatINR(data.summary.sumPaid)}`}
      actions={
        <>
          <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/expenses?projectId=${projectId}${fy ? `&fy=${fy}` : ""}`}>
            Open full list
          </Link>
          {!readOnly ? <FormDrawer label="Add expense" size="sm" title="New project expense" fields={fields} endpoint="/api/portal/expenses" initial={{ projectId, expenseDate: todayIso(), gstRate: "0", billStatus: "pending" }} preview="tax" /> : null}
        </>
      }
    >
      {data.rows.length ? (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Supplier</th>
                <th className="num">Total</th>
                <th>Payment</th>
                <th className="actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{fmtDate(r.expenseDate)}</td>
                  <td className="wrap">
                    {r.description}
                    {r.source === "material" ? <div className="pt-cell-sub">from material</div> : null}
                  </td>
                  <td>{r.categoryName}</td>
                  <td>{r.supplierName ?? r.payeeName ?? "—"}</td>
                  <td className="num">{formatINR(r.totalAmount)}</td>
                  <td>
                    <Badge status={r.paymentStatus} />
                  </td>
                  <td className="actions">
                    {r.source === "manual" && !readOnly ? <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit expense #${r.id}`} fields={fields} endpoint={`/api/portal/expenses/${r.id}`} method="PATCH" initial={r} preview="tax" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No expenses recorded for this project" />
      )}
    </Card>
  );
}

async function MaterialsTab({ projectId, fy, readOnly, lookups, purchasedOnly }: { projectId: number; fy?: number; readOnly: boolean; lookups: L; purchasedOnly: boolean }) {
  const data = await listMaterials(getDb(), { projectId, fy, pageSize: 200 });
  const rows = purchasedOnly ? data.rows.filter((r) => r.status !== "planned") : data.rows;
  const fields = materialFields(lookups);
  return (
    <Card
      flush
      title={purchasedOnly ? `Purchase records (${rows.length})` : `Materials & spares (${data.total})`}
      sub={`Purchased ${formatINR(data.summary.purchased)}${purchasedOnly ? "" : ` · planned estimate ${formatINR(data.summary.planned)}`}`}
      actions={!readOnly ? <FormDrawer label="Add item" size="sm" title="New material / spare" fields={fields} endpoint="/api/portal/materials" initial={{ projectId, status: "received", gstRate: "18", quantity: "1", purchaseDate: todayIso(), financialYearId: fy }} preview="material" /> : null}
    >
      {rows.length ? (
        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Supplier</th>
                <th className="num">Qty</th>
                <th className="num">Unit cost</th>
                <th className="num">Total</th>
                <th>Status</th>
                {purchasedOnly ? <th>Purchase date</th> : null}
                {purchasedOnly ? <th>Reference</th> : null}
                <th>Payment</th>
                <th className="actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.archivedAt ? "is-archived" : undefined}>
                  <td className="wrap">
                    <div className="pt-cell-main">{r.itemName}</div>
                    <div className="pt-cell-sub">{[r.specification, r.makeModel].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{r.categoryName}</td>
                  <td>{r.supplierName ?? "—"}</td>
                  <td className="num">
                    {formatNumber(r.quantity)} {r.unit ?? ""}
                  </td>
                  <td className="num">{formatINR(r.unitCost)}</td>
                  <td className="num">
                    <strong>{formatINR(r.totalAmount)}</strong>
                  </td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  {purchasedOnly ? <td className="nowrap">{fmtDate(r.purchaseDate)}</td> : null}
                  {purchasedOnly ? <td>{r.purchaseReference ?? "—"}</td> : null}
                  <td>{r.status === "planned" ? <span className="muted">—</span> : <Badge status={r.paymentStatus} />}</td>
                  <td className="actions">{!readOnly && !r.archivedAt ? <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit ${r.itemName}`} fields={fields} endpoint={`/api/portal/materials/${r.id}`} method="PATCH" initial={r} preview="material" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title={purchasedOnly ? "No purchases yet" : "No materials recorded for this project"} />
      )}
    </Card>
  );
}

async function SuppliersTab({ projectId, fy }: { projectId: number; fy?: number }) {
  const rows = await supplierSpending(getDb(), { projectId, fy });
  return (
    <Card flush title="Suppliers used on this project">
      {rows.length ? (
        <table className="pt-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Category</th>
              <th className="num">Entries</th>
              <th className="num">Total</th>
              <th className="num">Paid</th>
              <th className="num">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link className="pt-link" href={`/portal/suppliers/${s.id}`}>
                    {s.name}
                  </Link>
                </td>
                <td>{s.category ?? "—"}</td>
                <td className="num">{s.entries}</td>
                <td className="num">{formatINR(s.total)}</td>
                <td className="num">{formatINR(s.paid)}</td>
                <td className="num">{formatINR(s.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty title="No supplier spending yet" />
      )}
    </Card>
  );
}

async function ReceivablesTab({ projectId, readOnly, lookups }: { projectId: number; readOnly: boolean; lookups: L }) {
  const { invoices, receipts } = await projectReceivables(getDb(), projectId);
  const projLookups = { ...lookups, invoices: (lookups.invoices ?? []).filter((i) => i.projectId === projectId) };
  return (
    <div className="pt-grid pt-grid-2">
      <Card flush title="Invoices raised" actions={!readOnly ? <FormDrawer label="Add invoice" size="sm" title="New invoice" fields={invoiceFields(lookups)} endpoint="/api/portal/invoices" initial={{ projectId, invoiceDate: todayIso(), gstRate: "18", status: "issued" }} preview="invoice" /> : null}>
        {invoices.length ? (
          <table className="pt-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoiceNumber}</td>
                  <td className="nowrap">{fmtDate(i.invoiceDate)}</td>
                  <td className="num">{formatINR(i.totalAmount)}</td>
                  <td>
                    <Badge status={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="No invoices yet" />
        )}
      </Card>
      <Card flush title="Money received" actions={!readOnly ? <FormDrawer label="Record receipt" size="sm" title="Record receipt" fields={receiptFields(projLookups)} endpoint="/api/portal/receipts" initial={{ projectId, receiptDate: todayIso() }} /> : null}>
        {receipts.length ? (
          <table className="pt-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{fmtDate(r.receiptDate)}</td>
                  <td>{r.reference ?? r.paymentMethod ?? "—"}</td>
                  <td className="num">{formatINR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Nothing received yet" />
        )}
      </Card>
    </div>
  );
}

async function TimesheetsTab({ projectId, fy, lookups }: { projectId: number; fy?: number; lookups: L }) {
  const db = getDb();
  const [data, byEmployee] = await Promise.all([listTimesheets(db, { projectId, fy, pageSize: 100 }), timesheetSummary(db, { projectId, fy }, "employee")]);
  return (
    <div className="pt-grid" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
      <Card flush title={`Timesheet entries (${data.total})`} sub={`${fmtHours(data.summary.minutes)} hours`} actions={<FormDrawer label="Log time" size="sm" title="New timesheet entry" fields={timesheetFields(lookups)} endpoint="/api/portal/timesheets" initial={{ projectId, workDate: todayIso(), status: "submitted", breakMinutes: "0" }} preview="timesheet" />}>
        {data.rows.length ? (
          <table className="pt-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Task</th>
                <th className="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{fmtDate(t.workDate)}</td>
                  <td>{t.employeeName}</td>
                  <td className="wrap">{t.task}</td>
                  <td className="num">{fmtHours(t.totalMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="No time logged" />
        )}
      </Card>
      <Card flush title="Hours by employee">
        <table className="pt-table">
          <tbody>
            {byEmployee.map((r) => (
              <tr key={r.key}>
                <td>{r.key}</td>
                <td className="num">{fmtHours(r.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

async function DocumentsTab({ projectId }: { projectId: number }) {
  const data = await listDocuments(getDb(), { projectId, pageSize: 100 });
  return (
    <Card
      flush
      title={`Documents (${data.total})`}
      actions={
        <Link className="pt-btn pt-btn-primary pt-btn-sm" href={`/portal/documents?projectId=${projectId}`}>
          Manage / upload
        </Link>
      }
    >
      {data.rows.length ? (
        <table className="pt-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Uploaded</th>
              <th className="actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="pt-cell-main">{d.title}</div>
                  <div className="pt-cell-sub">{d.originalName}</div>
                </td>
                <td>
                  <Badge status={d.docType} tone="" />
                </td>
                <td className="nowrap">{fmtDate(d.createdAt.toISOString())}</td>
                <td className="actions">
                  <a className="pt-btn pt-btn-ghost pt-btn-sm" href={`/api/portal/documents/${d.id}/file`}>
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty title="No documents linked to this project" />
      )}
    </Card>
  );
}

