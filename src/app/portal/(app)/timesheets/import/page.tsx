import type { Metadata } from "next";
import { ImportWizard } from "@/components/portal/ImportWizard";
import { PageHeader } from "@/components/portal/ui";
import { requirePortal } from "@/lib/portal/page";

export const metadata: Metadata = { title: "Import timesheets" };

export default async function ImportPage() {
  await requirePortal();
  return (
    <>
      <PageHeader crumbs={[{ href: "/portal/timesheets", label: "Timesheets" }, { label: "Import" }]} title="Import timesheets" subtitle="Upload an Excel/CSV timesheet, map its columns, review validation, then confirm. Identical entries already in the portal are skipped." />
      <ImportWizard kind="timesheet" />
    </>
  );
}
