import { parseId, readJson, route } from "@/lib/portal/api";
import { setExpenseArchived } from "@/lib/portal/services/expenses";
import { archiveBody } from "@/lib/portal/validation";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const b = archiveBody.parse(await readJson(req));
  return setExpenseArchived(db, ctx, parseId(params.id), b.archived, b.correctionReason);
});
