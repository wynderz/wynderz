import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentUpload } from "@/components/portal/DocumentUpload";
import { FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, Kpi, Kpis, PageHeader } from "@/components/portal/ui";
import { documentMetaFields, supplierFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { requirePortal } from "@/lib/portal/page";
import { getSetting } from "@/lib/portal/services/settings";
import { getSupplier } from "@/lib/portal/services/suppliers";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requirePortal();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let supplier: Awaited<ReturnType<typeof getSupplier>>;
  try {
    supplier = await getSupplier(db, id);
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound();
    throw e;
  }
  const [lookups, uploads] = await Promise.all([loadLookups(db, ["years", "projects", "suppliers"]), getSetting(db, "uploads")]);

  const s = supplier;
  const initial: Record<string, unknown> = {};
  for (const f of supplierFields) initial[f.name] = (s as Record<string, unknown>)[f.name];

  const contact: Array<[string, string | null]> = [
    ["Supplier ID", s.code],
    ["Category", s.category],
    ["Contact person", s.contactPerson],
    ["Phone", s.phone],
    ["Email", s.email],
    ["GSTIN", s.gstin],
    ["City / location", s.city],
    ["Address", s.address],
    ["Notes", s.notes],
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/portal/suppliers", label: "Suppliers" }, { label: s.name }]}
        title={
          <>
            {s.name} <Badge status={s.status} />
          </>
        }
        subtitle="Totals cover all non-archived expenses for this supplier across every financial year, including material purchases (each counted once via its linked expense)."
        actions={
          <>
            <Link className="pt-btn pt-btn-secondary" href={`/portal/documents?supplierId=${s.id}`}>
              Documents
            </Link>
            <DocumentUpload fields={documentMetaFields(lookups)} supplierId={s.id} maxMb={uploads.maxMb} variant="secondary" />
            <FormDrawer label="Edit supplier" icon="edit" title={`Edit ${s.name}`} fields={supplierFields} endpoint={`/api/portal/suppliers/${s.id}`} method="PATCH" initial={initial} />
          </>
        }
      />

      <Kpis>
        <Kpi label="Total spend" value={s.totals.total} tone="navy" hint={`${Number(s.totals.count).toLocaleString("en-IN")} expenses`} />
        <Kpi label="Paid" value={s.totals.paid} tone="success" />
        <Kpi label="Outstanding" value={s.totals.outstanding} tone="warn" />
        <Kpi label="Material items" value={Number(s.materialCount).toLocaleString("en-IN")} money={false} hint={<Link href={`/portal/materials?supplierId=${s.id}`}>View materials</Link>} />
      </Kpis>

      <div className="pt-section pt-grid pt-grid-2">
        <Card title="Details">
          <dl className="pt-dl">
            {contact.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>
                  {!value ? (
                    <span className="muted">—</span>
                  ) : label === "Email" ? (
                    <a className="pt-link" href={`mailto:${value}`}>
                      {value}
                    </a>
                  ) : label === "Phone" ? (
                    <a className="pt-link" href={`tel:${value.replace(/\s+/g, "")}`}>
                      {value}
                    </a>
                  ) : (
                    <span style={label === "Address" || label === "Notes" ? { whiteSpace: "pre-line" } : undefined}>{value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card
          title="Recent expenses"
          sub="Latest 10 entries"
          flush
          actions={
            <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/expenses?supplierId=${s.id}`}>
              All expenses
            </Link>
          }
        >
          {s.recent.length ? (
            <div className="pt-table-wrap">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Total</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDate(r.expenseDate)}</td>
                      <td className="wrap">
                        <div className="pt-cell-main">{r.description}</div>
                        <div className="pt-cell-sub">#{r.id}</div>
                      </td>
                      <td className="num">{formatINR(r.totalAmount)}</td>
                      <td>
                        <Badge status={r.paymentStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No expenses recorded for this supplier yet" />
          )}
        </Card>
      </div>
    </>
  );
}
