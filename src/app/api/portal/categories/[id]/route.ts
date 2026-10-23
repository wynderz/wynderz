import { parseId, readJson, route } from "@/lib/portal/api";
import { deleteCategory, updateCategory } from "@/lib/portal/services/categories";

type P = { id: string };

export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateCategory(db, ctx, parseId(params.id), await readJson(req)));
export const DELETE = route<P>(async ({ params, db, ctx }) => {
  await deleteCategory(db, ctx, parseId(params.id));
  return { ok: true };
});
