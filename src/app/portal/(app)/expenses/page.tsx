import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR, formatNumber } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, Pagination, SortTh } from "@/components/portal/ui";
import { expenseFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { listExpenses } from "@/lib/portal/services/expenses";
import { todayIso } from "@/lib/portal/dates";

export const metadata: Metadata = { title: "Expenses" };

const BASE = "/portal/expenses";

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);
  const [data, lookups] = await Promise.all([
    listExpenses(db, { ...params, fy }),
    loadLookups(db, ["projects", "suppliers", "expenseCategories"]),
  ]);
  const fields = expenseFields(lookups);
  const s = data.summary;

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={`${year ? year.label : "All years"} · project, office, travel, machine and purchase spending. Material purchases appear here automatically and are edited from Materials & Spares.`}
        actions={
          <>
            <ExportLinks report="expenses" params={{ ...params, ...(fy ? { fy: String(fy) } : {}) }} />
            <FormDrawer label="Add expense" title="New expense" fields={fields} endpoint="/api/portal/expenses" initial={{ expenseDate: todayIso(), gstRate: "0", billStatus: "pending" }} preview="tax" />
          </>
        }
      />

      <Kpis>
        <Kpi label="Total (filtered)" value={s.sumTotal} tone="navy" hint={`${s.total.toLocaleString("en-IN")} entries`} />
        <Kpi label="Paid" value={s.sumPaid} tone="success" />
        <Kpi label="Unpaid" value={String(Number(s.sumTotal) - Number(s.sumPaid))} tone="warn" />
        <Kpi label="GST" value={s.sumGst} tone="info" />
      </Kpis>

      <div className="pt-section">
        <Card flush>
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search", placeholder: "Description, bill no., supplier, project…" },
              { name: "scope", label: "Type", type: "select", options: [{ value: "project", label: "Project expenses" }, { value: "general", label: "Office / general" }] },
              { name: "projectId", label: "Project", type: "select", options: (lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.code })) },
              { name: "categoryId", label: "Category", type: "select", options: (lookups.expenseCategories ?? []).map((c) => ({ value: String(c.id), label: c.name })) },
              { name: "supplierId", label: "Supplier", type: "select", options: (lookups.suppliers ?? []).map((c) => ({ value: String(c.id), label: c.name })) },
              { name: "paymentStatus", label: "Payment", type: "select", options: [{ value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" }] },
              { name: "from", label: "From", type: "date" },
              { name: "to", label: "To", type: "date" },
              { name: "archived", label: "Archived", type: "select", allLabel: "Hide", options: [{ value: "include", label: "Include" }, { value: "only", label: "Only archived" }] },
            ]}
          />
          {data.rows.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <SortTh label="Date" sortKey="date" base={BASE} params={params} />
                    <th>Description</th>
                    <SortTh label="Category" sortKey="category" base={BASE} params={params} />
                    <SortTh label="Project" sortKey="project" base={BASE} params={params} />
                    <SortTh label="Supplier / payee" sortKey="supplier" base={BASE} params={params} />
                    <th className="num">Qty</th>
                    <th className="num">Base</th>
                    <th className="num">GST</th>
                    <SortTh label="Total" sortKey="total" base={BASE} params={params} className="num" />
                    <SortTh label="Payment" sortKey="status" base={BASE} params={params} />
                    <th>Bill</th>
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={r.archivedAt ? "is-archived" : undefined}>
                      <td className="nowrap">{fmtDate(r.expenseDate)}</td>
                      <td className="wrap">
                        <div className="pt-cell-main">{r.description}</div>
                        <div className="pt-cell-sub">
                          #{r.id} · {r.yearLabel}
                          {r.source === "material" ? " · from material" : ""}
                          {r.paidBy ? ` · paid by ${r.paidBy}` : ""}
                        </div>
                      </td>
                      <td>{r.categoryName}</td>
                      <td>
                        {r.projectId ? (
                          <Link className="pt-link" href={`/portal/projects/${r.projectId}`}>
                            {r.projectCode}
                          </Link>
                        ) : (
                          <span className="muted">Office</span>
                        )}
                      </td>
                      <td>{r.supplierName ?? r.payeeName ?? <span className="muted">—</span>}</td>
                      <td className="num">{r.quantity ? formatNumber(r.quantity) : ""}</td>
                      <td className="num">{formatINR(r.baseAmount)}</td>
                      <td className="num muted">{Number(r.gstAmount) ? formatINR(r.gstAmount) : "—"}</td>
                      <td className="num">
                        <strong>{formatINR(r.totalAmount)}</strong>
                        {r.paymentStatus === "partial" ? <div className="pt-cell-sub">paid {formatINR(r.amountPaid)}</div> : null}
                      </td>
                      <td>
                        <Badge status={r.paymentStatus} />
                      </td>
                      <td>
                        <Badge status={r.billStatus}>{r.billNumber || r.billStatus.replace("_", " ")}</Badge>
                      </td>
                      <td className="actions">
                        {r.source === "material" ? (
                          <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/materials?q=${encodeURIComponent(r.description.split(" · ")[0])}`}>
                            View material
                          </Link>
                        ) : r.archivedAt ? (
                          <ActionButton label="Restore" icon="restore" endpoint={`/api/portal/expenses/${r.id}/archive`} body={{ archived: false }} successMessage="Expense restored" />
                        ) : (
                          <>
                            <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit expense #${r.id}`} fields={fields} endpoint={`/api/portal/expenses/${r.id}`} method="PATCH" initial={r} preview="tax" />
                            <ActionButton label="Archive" icon="archive" endpoint={`/api/portal/expenses/${r.id}/archive`} body={{ archived: true }} confirm="Archive this expense? It will be excluded from all totals." successMessage="Expense archived" />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No expenses match these filters">Add an expense or change the filters above.</Empty>
          )}
          <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </Card>
      </div>
    </>
  );
}
