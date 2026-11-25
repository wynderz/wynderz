import { queryObject, route } from "@/lib/portal/api";
import { salarySheet } from "@/lib/portal/services/payroll";
import { fileResponse } from "@/lib/portal/spreadsheet";

/** GET ?month=YYYY-MM — the month's Salary Payment workbook (full bank account numbers; audited). */
export const GET = route(async ({ req, db, ctx }) => {
  const sheet = await salarySheet(db, ctx, queryObject(req));
  return fileResponse(sheet.body, sheet.fileName, "xlsx");
});
