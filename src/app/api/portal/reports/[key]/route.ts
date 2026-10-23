import { queryObject, route } from "@/lib/portal/api";
import { audit } from "@/lib/portal/audit";
import { todayIso } from "@/lib/portal/dates";
import { notFound } from "@/lib/portal/errors";
import { getReport, reportFilter } from "@/lib/portal/reports";
import { buildCsv, buildXlsx, fileResponse } from "@/lib/portal/spreadsheet";

/** GET ?format=xlsx|csv|json plus filters (fy, from, to, projectId, categoryId, employeeId). */
export const GET = route<{ key: string }>(async ({ req, params, db, ctx }) => {
  const report = getReport(params.key);
  if (!report) throw notFound("Report");
  const q = queryObject(req);
  const filter = reportFilter.parse(q);
  const result = await report.run(db, filter);
  const format = q.format === "csv" ? "csv" : q.format === "json" ? "json" : "xlsx";
  if (format === "json") return { title: report.title, headers: result.columns.map((c) => c.header), rows: result.rows.map((r) => result.columns.map((c) => c.value(r))) };
  const rows = result.totals ? [...result.rows, result.totals] : result.rows;
  const name = `wynderz-${report.key}-${todayIso()}.${format}`;
  await audit(db, ctx, { action: "export", entity: "report", entityId: report.key, summary: `Exported ${report.title} (${format}, ${result.rows.length} rows)` });
  if (format === "csv") return fileResponse(buildCsv(result.columns, rows), name, "csv");
  const title = `WYNDERZ · ${report.title}${result.note ? ` — ${result.note}` : ""}`;
  return fileResponse(await buildXlsx(report.title, result.columns, rows, title), name, "xlsx");
});
