import type { Metadata } from "next";
import { ImportWizard } from "@/components/portal/ImportWizard";
import { PageHeader } from "@/components/portal/ui";
import { requirePortal } from "@/lib/portal/page";

export const metadata: Metadata = { title: "Import attendance" };

export default async function ImportPage() {
  await requirePortal();
  return (
    <>
      <PageHeader crumbs={[{ href: "/portal/attendance", label: "Attendance" }, { label: "Import" }]} title="Import attendance" subtitle="Upload the Excel/CSV export from the fingerprint device, map its columns once (and save the mapping for next time), review validation results, then confirm. Unmatched employees are reported, never created; re-importing the same file never duplicates records." />
      <ImportWizard kind="attendance" />
    </>
  );
}
