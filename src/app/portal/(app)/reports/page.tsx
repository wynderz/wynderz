import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/portal/ui";
import { Icon } from "@/components/portal/icons";
import { requirePortal } from "@/lib/portal/page";
import { REPORTS, type ReportDef } from "@/lib/portal/reports";

export const metadata: Metadata = { title: "Reports" };

const GROUPS: ReportDef["group"][] = ["Finance", "Projects", "Suppliers", "People"];

const FILTER_LABELS: Record<ReportDef["filters"][number], string> = {
  fy: "year",
  range: "date range",
  project: "project",
  category: "category",
  employee: "employee",
};

export default async function ReportsPage() {
  await requirePortal();

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Every report uses the same calculation rules as the dashboards. Open one to filter, print, or export to Excel / CSV. The financial year selected in the top bar applies to all reports."
      />
      {GROUPS.map((group) => {
        const items = REPORTS.filter((r) => r.group === group);
        if (!items.length) return null;
        return (
          <div className="pt-section" key={group}>
            <h2 className="pt-section-title">{group}</h2>
            <div className="pt-grid pt-grid-3">
              {items.map((r) => (
                <Card key={r.key}>
                  <h3 className="pt-card-title">
                    <Link className="pt-link" href={`/portal/reports/${r.key}`}>
                      <Icon name="chart" /> {r.title}
                    </Link>
                  </h3>
                  <p className="pt-card-sub">{r.description}</p>
                  <p className="pt-help">{r.filters.length ? `Filter by ${r.filters.map((f) => FILTER_LABELS[f]).join(", ")}` : "All financial years, no filters"}</p>
                  <Link className="pt-btn pt-btn-secondary pt-btn-sm" href={`/portal/reports/${r.key}`}>
                    Open report →
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
