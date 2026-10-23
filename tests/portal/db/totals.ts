import { categoryBreakdown } from "@/lib/portal/queries/finance";
import { addMoney } from "@/lib/portal/money";
import type { Db } from "@/lib/portal/db";

/** Sum of the category chart must equal the expense total shown on KPI cards. */
export async function categoryTotals(db: Db, fy: number) {
  const rows = await categoryBreakdown(db, { fy });
  return addMoney(...rows.map((r) => r.total));
}
