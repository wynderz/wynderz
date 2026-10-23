import type { Metadata } from "next";
import Link from "next/link";
import { Donut } from "@/components/portal/charts";
import { FilterBar } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR, formatNumber } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, Kpi, Kpis, PageHeader, Pagination, SortTh } from "@/components/portal/ui";
import { todayIso } from "@/lib/portal/dates";
import { materialFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { listMaterials, materialCategoryTotals } from "@/lib/portal/services/materials";

export const metadata: Metadata = { title: "Materials & Spares" };

const BASE = "/portal/materials";

export default async function MaterialsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);
  const [data, lookups, categoryTotals] = await Promise.all([
    listMaterials(db, { ...params, fy }),
    loadLookups(db, ["projects", "suppliers", "materialCategories", "years"]),
    materialCategoryTotals(db, fy),
  ]);
  const fields = materialFields(lookups);
  const s = data.summary;

  return (
    <>
      <PageHeader
        title="Materials & Spares"
        subtitle={`${year ? year.label : "All years"} · ordered or received items create exactly one linked expense, so spending is never counted twice. Planned items are estimates only and are not included in expenditure.`}
        actions={
          <>
            <ExportLinks report="materials" params={{ ...params, ...(fy ? { fy: String(fy) } : {}) }} />
            <FormDrawer
              label="Add material"
              title="New material / spare"
              fields={fields}
              endpoint="/api/portal/materials"
              initial={{ status: "received", gstRate: "18", quantity: "1", purchaseDate: todayIso(), financialYearId: fy ?? "" }}
              preview="material"
            />
          </>
        }
      />

      <Kpis>
        <Kpi label="Purchased (ordered + received)" value={s.purchased} tone="navy" hint="Included in expenses via the linked entry" />
        <Kpi label="Planned estimate" value={s.planned} tone="info" hint="Not counted as spending" />
        <Kpi label="Items (filtered)" value={s.total.toLocaleString("en-IN")} money={false} />
      </Kpis>

      <div className="pt-section">
        <Card flush>
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search", placeholder: "Item, spec, make, reference, supplier…" },
              { name: "projectId", label: "Project", type: "select", options: (lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.code })) },
              { name: "categoryId", label: "Category", type: "select", options: (lookups.materialCategories ?? []).map((c) => ({ value: String(c.id), label: c.name })) },
              { name: "supplierId", label: "Supplier", type: "select", options: (lookups.suppliers ?? []).map((c) => ({ value: String(c.id), label: c.name })) },
              { name: "status", label: "Status", type: "select", options: [{ value: "planned", label: "Planned" }, { value: "ordered", label: "Ordered" }, { value: "received", label: "Received" }] },
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
                    <SortTh label="Item" sortKey="item" base={BASE} params={params} />
                    <SortTh label="Category" sortKey="category" base={BASE} params={params} />
                    <th>Project</th>
                    <th>Supplier</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit cost</th>
                    <th className="num">GST</th>
                    <SortTh label="Total" sortKey="total" base={BASE} params={params} className="num" />
                    <SortTh label="Status" sortKey="status" base={BASE} params={params} />
                    <th>Payment</th>
                    <th>Expense</th>
                    <th className="actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={r.archivedAt ? "is-archived" : undefined}>
                      <td className="nowrap">{r.purchaseDate ? fmtDate(r.purchaseDate) : <span className="muted">—</span>}</td>
                      <td className="wrap">
                        <div className="pt-cell-main">{r.itemName}</div>
                        <div className="pt-cell-sub">
                          #{r.id} · {r.yearLabel}
                          {r.specification ? ` · ${r.specification}` : ""}
                          {r.makeModel ? ` · ${r.makeModel}` : ""}
                          {r.purchaseReference ? ` · ref ${r.purchaseReference}` : ""}
                        </div>
                      </td>
                      <td>{r.categoryName}</td>
                      <td>
                        {r.projectId ? (
                          <Link className="pt-link" href={`/portal/projects/${r.projectId}`} title={r.projectName ?? undefined}>
                            {r.projectCode}
                          </Link>
                        ) : (
                          <span className="muted">General</span>
                        )}
                      </td>
                      <td>
                        {r.supplierId ? (
                          <Link className="pt-link" href={`/portal/suppliers/${r.supplierId}`}>
                            {r.supplierName}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="num nowrap">
                        {formatNumber(r.quantity)} {r.unit ?? ""}
                      </td>
                      <td className="num">{formatINR(r.unitCost)}</td>
                      <td className="num muted">{Number(r.gstAmount) ? formatINR(r.gstAmount) : "—"}</td>
                      <td className="num">
                        <strong>{formatINR(r.totalAmount)}</strong>
                        {r.status === "planned" ? <div className="pt-cell-sub">estimate</div> : null}
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        {r.status === "planned" ? (
                          <span className="muted">—</span>
                        ) : (
                          <>
                            <Badge status={r.paymentStatus} />
                            {r.paymentStatus === "partial" ? <div className="pt-cell-sub">paid {formatINR(r.amountPaid)}</div> : null}
                          </>
                        )}
                      </td>
                      <td>
                        {r.expenseId ? (
                          <Link className="pt-link" href={`/portal/expenses?q=${encodeURIComponent(r.itemName)}${r.archivedAt ? "&archived=include" : ""}`} title="Open the linked expense">
                            #{r.expenseId}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="actions">
                        {r.archivedAt ? (
                          <ActionButton label="Restore" icon="restore" endpoint={`/api/portal/materials/${r.id}/archive`} body={{ archived: false }} successMessage="Material restored" />
                        ) : (
                          <>
                            <FormDrawer label="Edit" icon="edit" variant="ghost" size="sm" title={`Edit material #${r.id}`} fields={fields} endpoint={`/api/portal/materials/${r.id}`} method="PATCH" initial={r} preview="material" />
                            <ActionButton
                              label="Archive"
                              icon="archive"
                              endpoint={`/api/portal/materials/${r.id}/archive`}
                              body={{ archived: true }}
                              confirm={r.expenseId ? "Archive this item? Its linked expense is archived too and excluded from all totals." : "Archive this item?"}
                              successMessage="Material archived"
                            />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No materials match these filters">Add a material or change the filters above.</Empty>
          )}
          <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
        </Card>
      </div>

      <div className="pt-section pt-grid pt-grid-2">
        <Card title="Spend by material category" sub={`Ordered and received items · ${year ? year.label : "all years"}`}>
          <Donut data={categoryTotals} labelKey="category" valueKey="total" />
        </Card>
      </div>
    </>
  );
}
