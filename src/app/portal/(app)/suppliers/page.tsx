import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { FormDrawer } from "@/components/portal/forms";
import { formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, PageHeader, Pagination, SortTh } from "@/components/portal/ui";
import { supplierFields } from "@/lib/portal/fields";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { listSuppliers } from "@/lib/portal/services/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

const BASE = "/portal/suppliers";

export default async function SuppliersPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);
  const data = await listSuppliers(db, { ...params, fy });

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle={`Vendors and service providers. Spend is the total of recorded expenses (including material purchases) for ${year ? year.label : "all years"}.`}
        actions={<FormDrawer label="Add supplier" title="New supplier" fields={supplierFields} endpoint="/api/portal/suppliers" initial={{ status: "active" }} />}
      />

      <Card flush>
        <FilterBar
          fields={[
            { name: "q", label: "Search", type: "search", placeholder: "Name, ID, category, city, GSTIN, contact…" },
            { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
          ]}
        />
        {data.rows.length ? (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <SortTh label="ID" sortKey="code" base={BASE} params={params} />
                  <SortTh label="Supplier" sortKey="name" base={BASE} params={params} />
                  <th>Contact</th>
                  <th>GSTIN</th>
                  <SortTh label="City" sortKey="city" base={BASE} params={params} />
                  <th>Status</th>
                  <SortTh label="Total spend" sortKey="spend" base={BASE} params={params} className="num" />
                  <th className="actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{r.code}</td>
                    <td className="wrap">
                      <Link className="pt-link pt-cell-main" href={`/portal/suppliers/${r.id}`}>
                        {r.name}
                      </Link>
                      {r.category ? <div className="pt-cell-sub">{r.category}</div> : null}
                    </td>
                    <td className="wrap">
                      {r.contactPerson ?? <span className="muted">—</span>}
                      {r.phone || r.email ? <div className="pt-cell-sub">{[r.phone, r.email].filter(Boolean).join(" · ")}</div> : null}
                    </td>
                    <td className="nowrap">{r.gstin ?? <span className="muted">—</span>}</td>
                    <td>{r.city ?? <span className="muted">—</span>}</td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td className="num">
                      <strong>{formatINR(r.totalSpend)}</strong>
                    </td>
                    <td className="actions">
                      <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/suppliers/${r.id}`}>
                        View / edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No suppliers match these filters">Add a supplier or change the filters above.</Empty>
        )}
        <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
      </Card>
    </>
  );
}
