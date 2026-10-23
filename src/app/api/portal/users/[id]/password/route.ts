import { parseId, readJson, route } from "@/lib/portal/api";
import { resetUserPassword } from "@/lib/portal/services/users";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  await resetUserPassword(db, ctx, parseId(params.id), await readJson(req));
  return { ok: true };
});
