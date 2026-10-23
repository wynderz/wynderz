import type { Metadata } from "next";
import Link from "next/link";
import { DocumentUpload } from "@/components/portal/DocumentUpload";
import { FilterBar } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, labelize } from "@/components/portal/format";
import { Icon } from "@/components/portal/icons";
import { Badge, Card, Empty, PageHeader, Pagination } from "@/components/portal/ui";
import { DOC_TYPE_OPTIONS, documentMetaFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { listDocuments } from "@/lib/portal/services/documents";
import { getSetting } from "@/lib/portal/services/settings";

export const metadata: Metadata = { title: "Documents" };

const BASE = "/portal/documents";

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Only PDFs and raster images are previewed in the browser; everything else downloads. */
const canPreview = (mime: string) => mime === "application/pdf" || /^image\/(png|jpeg|gif|webp)$/.test(mime);

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year } = await selectedYear(params);
  const [data, lookups, uploads] = await Promise.all([
    listDocuments(db, { ...params, fy }),
    loadLookups(db, ["years", "projects", "suppliers"]),
    getSetting(db, "uploads"),
  ]);
  const fields = documentMetaFields(lookups);
  const yearIdByLabel = new Map((lookups.years ?? []).map((y) => [y.label, y.id]));
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle={`${year ? year.label : "All years"} · bills, quotations, purchase orders, contracts and drawings, stored privately. Link each file to a project, supplier, expense or material so it shows up where it is needed.`}
        actions={
          <DocumentUpload
            fields={fields}
            maxMb={uploads.maxMb}
            financialYearId={fy}
            projectId={num(params.projectId)}
            supplierId={num(params.supplierId)}
            expenseId={num(params.expenseId)}
            materialId={num(params.materialId)}
          />
        }
      />

      <Card flush>
        <FilterBar
          fields={[
            { name: "q", label: "Search", type: "search", placeholder: "Title, file name, notes, project, supplier…" },
            { name: "docType", label: "Type", type: "select", options: DOC_TYPE_OPTIONS },
            { name: "projectId", label: "Project", type: "select", options: (lookups.projects ?? []).map((p) => ({ value: String(p.id), label: p.code })) },
            { name: "supplierId", label: "Supplier", type: "select", options: (lookups.suppliers ?? []).map((c) => ({ value: String(c.id), label: c.name })) },
            { name: "archived", label: "Archived", type: "select", allLabel: "Hide", options: [{ value: "include", label: "Include" }, { value: "only", label: "Only archived" }] },
          ]}
        />
        {params.expenseId || params.materialId ? (
          <div className="pt-alert info" style={{ margin: "0 1rem 0.75rem" }}>
            Showing documents linked to {params.expenseId ? `expense #${params.expenseId}` : `material #${params.materialId}`}.{" "}
            <Link className="pt-link" href={BASE}>
              Show all
            </Link>
          </div>
        ) : null}
        {data.rows.length ? (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Project</th>
                  <th>Supplier</th>
                  <th>Expense</th>
                  <th>Material</th>
                  <th className="num">Size</th>
                  <th>Uploaded by</th>
                  <th>Date</th>
                  <th className="actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className={r.archivedAt ? "is-archived" : undefined}>
                    <td className="wrap">
                      <div className="pt-cell-main">{r.title}</div>
                      <div className="pt-cell-sub">
                        {r.originalName}
                        {r.yearLabel ? ` · ${r.yearLabel}` : ""}
                      </div>
                    </td>
                    <td>
                      <Badge tone="">{labelize(r.docType)}</Badge>
                    </td>
                    <td>
                      {r.projectId ? (
                        <Link className="pt-link" href={`/portal/projects/${r.projectId}`}>
                          {r.projectCode}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
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
                    <td>{r.expenseId ? `#${r.expenseId}` : <span className="muted">—</span>}</td>
                    <td>{r.materialId ? `#${r.materialId}` : <span className="muted">—</span>}</td>
                    <td className="num nowrap">{formatSize(Number(r.sizeBytes))}</td>
                    <td>{r.uploadedBy ?? <span className="muted">—</span>}</td>
                    <td className="nowrap">{fmtDate(r.createdAt)}</td>
                    <td className="actions">
                      {canPreview(r.mimeType) ? (
                        <a className="pt-btn pt-btn-ghost pt-btn-sm" href={`/api/portal/documents/${r.id}/file?inline=1`} target="_blank" rel="noopener" aria-label={`Preview ${r.title} (opens in a new tab)`}>
                          <Icon name="eye" /> Preview
                        </a>
                      ) : null}
                      <a className="pt-btn pt-btn-ghost pt-btn-sm" href={`/api/portal/documents/${r.id}/file`} aria-label={`Download ${r.originalName}`}>
                        <Icon name="download" /> Download
                      </a>
                      {r.archivedAt ? (
                        <ActionButton label="Restore" icon="restore" endpoint={`/api/portal/documents/${r.id}/archive`} body={{ archived: false }} successMessage="Document restored" />
                      ) : (
                        <>
                          <FormDrawer
                            label="Edit"
                            icon="edit"
                            variant="ghost"
                            size="sm"
                            title={`Edit document #${r.id}`}
                            fields={fields}
                            endpoint={`/api/portal/documents/${r.id}`}
                            method="PATCH"
                            initial={{ ...r, financialYearId: r.yearLabel ? yearIdByLabel.get(r.yearLabel) : undefined }}
                            extraBody={{ invoiceId: r.invoiceId }}
                          />
                          <ActionButton label="Archive" icon="archive" endpoint={`/api/portal/documents/${r.id}/archive`} body={{ archived: true }} confirm="Archive this document? The file is kept and can be restored." successMessage="Document archived" />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No documents match these filters">Upload a document or change the filters above.</Empty>
        )}
        <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
      </Card>
    </>
  );
}
