import { parseId, readJson, route } from "@/lib/portal/api";
import { setReceivableArchived } from "@/lib/portal/services/receivables";
import { archiveBody } from "@/lib/portal/validation";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const b = archiveBody.parse(await readJson(req));
  await setReceivableArchived(db, ctx, "receipt", parseId(params.id), b.archived, b.correctionReason);
  return { ok: true };
});
