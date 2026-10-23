import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/portal/FilterBar";
import { ActionButton, FormDrawer } from "@/components/portal/forms";
import { fmtDate, formatINR } from "@/components/portal/format";
import { Badge, Card, Empty, ExportLinks, PageHeader, Pagination, ProgressBar, SortTh } from "@/components/portal/ui";
import { projectFields } from "@/lib/portal/fields";
import { loadLookups } from "@/lib/portal/lookups";
import { readParams, requirePortal, selectedYear, type SearchParams } from "@/lib/portal/page";
import { listProjects } from "@/lib/portal/services/projects";

export const metadata: Metadata = { title: "Projects" };

const BASE = "/portal/projects";

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requirePortal();
  const params = await readParams(searchParams);
  const { fy, year, years } = await selectedYear(params);
  const [data, lookups] = await Promise.all([listProjects(db, { ...params, fy }), loadLookups(db, ["years"])]);
  const fields = projectFields(lookups);
  const defaultYear = year?.id ?? years.find((y) => y.status === "open")?.id ?? years[years.length - 1]?.id;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${year ? `${year.label}: projects opened in this year or with activity in it` : "All projects across every financial year"}. Costs shown are ${year ? "for the selected year" : "all-time"}.`}
        actions={
          <>
            <ExportLinks report="budget-vs-actual" params={{ ...params, ...(fy ? { fy: String(fy) } : {}) }} />
            {years.length ? (
              <FormDrawer label="Create project" title="New project" fields={fields} endpoint="/api/portal/projects" initial={{ financialYearId: defaultYear, status: "active" }} />
            ) : (
              <Link className="pt-btn pt-btn-primary" href="/portal/financial-years">
                Create a financial year first
              </Link>
            )}
          </>
        }
      />

      <Card flush>
        <FilterBar
          fields={[
            { name: "q", label: "Search", type: "search", placeholder: "Name, code, customer, PO…" },
            { name: "status", label: "Status", type: "select", options: ["planned", "active", "on_hold", "completed", "cancelled"].map((s) => ({ value: s, label: s.replace("_", " ") })) },
            { name: "archived", label: "Archived", type: "select", allLabel: "Hide", options: [{ value: "include", label: "Include" }, { value: "only", label: "Only archived" }] },
          ]}
        />
        {data.rows.length ? (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <SortTh label="Code" sortKey="code" base={BASE} params={params} />
                  <SortTh label="Project" sortKey="name" base={BASE} params={params} />
                  <SortTh label="Status" sortKey="status" base={BASE} params={params} />
                  <SortTh label="Start" sortKey="startDate" base={BASE} params={params} />
                  <SortTh label="Budget" sortKey="budget" base={BASE} params={params} className="num" />
                  <SortTh label="Actual cost" sortKey="actualCost" base={BASE} params={params} className="num" />
                  <th style={{ minWidth: "7rem" }}>Budget used</th>
                  <SortTh label="Contract value" sortKey="contractValue" base={BASE} params={params} className="num" />
                  <th className="num">Received</th>
                  <th className="num">Receivable</th>
                  <th className="actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id} className={p.archivedAt ? "is-archived" : undefined}>
                    <td className="nowrap">
                      <Link className="pt-link" href={`/portal/projects/${p.id}`}>
                        {p.code}
                      </Link>
                    </td>
                    <td className="wrap">
                      <div className="pt-cell-main">{p.name}</div>
                      <div className="pt-cell-sub">
                        {p.customer ?? "No customer"} · opened {p.yearLabel}
                      </div>
                    </td>
                    <td>
                      <Badge status={p.status} />
                    </td>
                    <td className="nowrap">{fmtDate(p.startDate)}</td>
                    <td className="num">{formatINR(p.budget)}</td>
                    <td className="num">
                      <strong>{formatINR(p.actualCost)}</strong>
                    </td>
                    <td>{Number(p.budget) > 0 ? <ProgressBar value={Number(p.actualCost)} max={Number(p.budget)} /> : <span className="muted">—</span>}</td>
                    <td className="num muted">{formatINR(p.contractValue)}</td>
                    <td className="num">{formatINR(p.received)}</td>
                    <td className="num">{Number(p.receivable) ? formatINR(p.receivable) : "—"}</td>
                    <td className="actions">
                      {p.archivedAt ? (
                        <ActionButton label="Restore" icon="restore" endpoint={`/api/portal/projects/${p.id}/archive`} body={{ archived: false }} successMessage="Project restored" />
                      ) : (
                        <Link className="pt-btn pt-btn-ghost pt-btn-sm" href={`/portal/projects/${p.id}`}>
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No projects found">{years.length ? "Create a project or adjust the filters." : "Create a financial year, then add projects to it."}</Empty>
        )}
        <Pagination base={BASE} params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
      </Card>
    </>
  );
}
