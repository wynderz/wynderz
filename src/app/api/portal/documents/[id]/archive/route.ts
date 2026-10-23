import { parseId, readJson, route } from "@/lib/portal/api";
import { setDocumentArchived } from "@/lib/portal/services/documents";
import { archiveBody } from "@/lib/portal/validation";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const b = archiveBody.parse(await readJson(req));
  return setDocumentArchived(db, ctx, parseId(params.id), b.archived);
});
