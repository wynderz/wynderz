import { parseId, readJson, route } from "@/lib/portal/api";
import { setMaterialArchived } from "@/lib/portal/services/materials";
import { archiveBody } from "@/lib/portal/validation";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const b = archiveBody.parse(await readJson(req));
  return setMaterialArchived(db, ctx, parseId(params.id), b.archived, b.correctionReason);
});
