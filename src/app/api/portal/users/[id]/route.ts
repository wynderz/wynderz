import { parseId, readJson, route } from "@/lib/portal/api";
import { deleteUser, updateUser } from "@/lib/portal/services/users";

type P = { id: string };

export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateUser(db, ctx, parseId(params.id), await readJson(req)));
export const DELETE = route<P>(async ({ params, db, ctx }) => {
  await deleteUser(db, ctx, parseId(params.id));
  return { ok: true };
});
