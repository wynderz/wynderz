import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, type FilterField } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, Pagination, Tabs } from "@/components/portal/ui";
import { todayIso } from "@/lib/portal/dates";
import { invoiceFields, receiptFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, withParams, type SearchParams } from "@/lib/portal/page";
import { listInvoices, listReceipts } from "@/lib/portal/services/receivables";

export const metadata: Metadata = { title: "Invoices & Receipts" };

const BASE = "/portal/receivables";

/** Paid / partially paid are derived from receipts; the edit form only accepts draft / issued / cancelled. */
const editableStatus = (status: string) => (status === "paid" || status === "partially_paid" ? "issued" : status);

export default async function ReceivablesPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);
  const tab = params.tab === "receipts" ? "receipts" : "invoices";
  const query = { ...params, fy };

  const [invoices, receipts, lookups] = await Promise.all([
    listInvoices(db, tab === "invoices" ? query : { ...query, page: 1, pageSize: 1 }),
    tab === "receipts" ? listReceipts(db, query) : null,
    loadLookups(db, ["projects", "invoices"]),
  ]);
  const iFields = invoiceFields(lookups);
  const rFields = receiptFields(lookups);
  const s = invoices.summary;

  const filters: FilterField[] = [
    { name: "q", label: "Search", type: "search", placeholder: tab === "invoices" ? "Invoice no., customer, project…" : "Reference, invoice no., project…" },
    { name: "projectId", label: "Project", type: "select", options: (lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.code })) },
    { name: "from", label: "From", type: "date" },
    { name: "to", label: "To", type: "date" },
    { name: "archived", label: "Archived", type: "select", allLabel: "Hide", options: [{ value: "include", label: "Include" }, { value: "only", label: "Only archived" }] },
  ];

  return (
    <>
      <PageHeader
        title="Invoices & Receipts"
        subtitle={`${year ? year.label : "All years"} · invoices are amounts billed to customers; receipts are money actually received. Receivables = invoiced − received. A project's contract value is an agreement amount, not revenue.`}
        actions={
          <>
            <ExportLinks report="receivables" params={{ ...params, ...(fy ? { fy: String(fy) } : {}) }} />
            <FormDrawer label="Record receipt" variant={tab === "receipts" ? "primary" : "secondary"} title="New receipt" fields={rFields} endpoint="/api/portal/receipts" initial={{ receiptDate: todayIso() }} />
            <FormDrawer label="New invoice" variant={tab === "invoices" ? "primary" : "secondary"} title="New invoice" fields={iFields} endpoint="/api/portal/invoices" initial={{ invoiceDate: todayIso(), gstRate: "18", status: "issued" }} preview="invoice" />
          </>
        }
      />

      <Kpis>
        <Kpi label="Invoiced" value={s.invoiced} tone="navy" hint={`${s.total.toLocaleString("en-IN")} invoices · excl. cancelled`} />
        <Kpi label="Received against invoices" value={s.received} tone="success" />
        <Kpi label="Outstanding receivables" value={s.outstanding} tone="warn" hint="Invoiced − received" />
        {receipts ? <Kpi label="All receipts (filtered)" value={receipts.summary.amount} tone="info" hint={`${receipts.summary.total.toLocaleString("en-IN")} receipts, incl. unlinked`} /> : null}
      </Kpis>

      <div className="pt-section">
        <Tabs
          active={tab}
          tabs={[
            { key: "invoices", label: "Invoices", href: withParams(BASE, params, { tab: null, page: null }) },
            { key: "receipts", label: "Receipts", href: withParams(BASE, params, { tab: "receipts", page: null }) },
          ]}
        />
        <Card flush>
          <FilterBar fields={filters} />
          {tab === "invoices" ? (
            <>
              {invoices.rows.length ? (
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice</th>
                        <th>Project</th>
                        <th className="num">Basic</th>
                        <th className="num">GST</th>
                        <th className="num">Total</th>
                        <th className="num">Received</th>
                        <th className="num">Outstanding</th>
                        <th>Status</th>
                        <th className="actions" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.rows.map((r) => (
                        <tr key={r.id} className={r.archivedAt ? "is-archived" : undefined}>
                          <td className="nowrap">{fmtDate(r.invoiceDate)}</td>
                          <td className="wrap">
                            <div className="pt-cell-main">{r.invoiceNumber}</div>
                            <div className="pt-cell-sub">
                              {r.customer ?? "—"} · {r.yearLabel}
                              {r.dueDate ? ` · due ${fmtDate(r.dueDate)}` : ""}
                            </div>
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
                          <td className="num">{formatINR(r.baseAmount)}</td>
                          <td className="num muted">{Number(r.gstAmount) ? formatINR(r.gstAmount) : "—"}</td>
                          <td className="num">
                            <strong>{formatINR(r.totalAmount)}</strong>
                          </td>
                          <td className="num">{formatINR(r.received)}</td>
                          <td className="num">{Number(r.outstanding) ? <strong>{formatINR(r.outstanding)}</strong> : <span className="muted">{formatINR(r.outstanding)}</span>}</td>
                          <td>
                            <Badge status={r.status} />
                          </td>
                          <td className="actions">
                            {r.archivedAt ? (
                              <ActionButton label="Restore" icon="restore" endpoint={`/api/portal/invoices/${r.id}/archive`} body={{ archived: false }} successMessage="Invoice restored" />
                            ) : (
                              <>
                                {r.status !== "cancelled" && r.status !== "draft" && Number(r.outstanding) > 0 ? (
                                  <FormDrawer
                                    label="Receipt"
                                    icon="plus"
                                    variant="ghost"
                                    size="sm"
                                    title={`Record receipt for ${r.invoiceNumber}`}
                                    fields={rFields}
                                    endpoint="/api/portal/receipts"
                                    initial={{ receiptDate: todayIso(), invoiceId: r.id, projectId: r.projectId, amount: r.outstanding }}
                                  />
                                ) : null}
                                <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit invoice ${r.invoiceNumber}`} fields={iFields} endpoint={`/api/portal/invoices/${r.id}`} method="PATCH" initial={{ ...r, status: editableStatus(r.status) }} preview="invoice" />
                                <ActionButton label="Archive" icon="archive" endpoint={`/api/portal/invoices/${r.id}/archive`} body={{ archived: true }} confirm="Archive this invoice? It will be excluded from receivable totals." successMessage="Invoice archived" />
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No invoices match these filters">Create an invoice or change the filters above.</Empty>
              )}
              <Pagination base={BASE} params={params} page={invoices.page} pageCount={invoices.pageCount} total={invoices.total} pageSize={invoices.pageSize} />
            </>
          ) : receipts ? (
            <>
              {receipts.rows.length ? (
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice</th>
                        <th>Project</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th className="num">Amount</th>
                        <th className="actions" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.rows.map((r) => (
                        <tr key={r.id} className={r.archivedAt ? "is-archived" : undefined}>
                          <td className="nowrap">{fmtDate(r.receiptDate)}</td>
                          <td>
                            {r.invoiceNumber ?? <span className="muted">Not linked</span>}
                            <div className="pt-cell-sub">
                              #{r.id} · {r.yearLabel}
                            </div>
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
                          <td>{r.paymentMethod ?? <span className="muted">—</span>}</td>
                          <td className="wrap">
                            {r.reference ?? <span className="muted">—</span>}
                            {r.notes ? <div className="pt-cell-sub">{r.notes}</div> : null}
                          </td>
                          <td className="num">
                            <strong>{formatINR(r.amount)}</strong>
                          </td>
                          <td className="actions">
                            {r.archivedAt ? (
                              <ActionButton label="Restore" icon="restore" endpoint={`/api/portal/receipts/${r.id}/archive`} body={{ archived: false }} successMessage="Receipt restored" />
                            ) : (
                              <ActionButton label="Archive" icon="archive" endpoint={`/api/portal/receipts/${r.id}/archive`} body={{ archived: true }} confirm="Archive this receipt? The linked invoice's received amount and status are recalculated." successMessage="Receipt archived" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No receipts match these filters">Record a receipt or change the filters above.</Empty>
              )}
              <Pagination base={BASE} params={params} page={receipts.page} pageCount={receipts.pageCount} total={receipts.total} pageSize={receipts.pageSize} />
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}
