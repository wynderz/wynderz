import { parseId, readJson, route } from "@/lib/portal/api";
import { setProjectArchived } from "@/lib/portal/services/projects";
import { archiveBody } from "@/lib/portal/validation";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const b = archiveBody.parse(await readJson(req));
  return setProjectArchived(db, ctx, parseId(params.id), b.archived);
});
