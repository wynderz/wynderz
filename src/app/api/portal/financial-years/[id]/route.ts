import { parseId, readJson, route } from "@/lib/portal/api";
import { deleteYear, updateYear } from "@/lib/portal/services/financial-years";

type P = { id: string };

export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateYear(db, ctx, parseId(params.id), await readJson(req)));
export const DELETE = route<P>(async ({ params, db, ctx }) => {
  await deleteYear(db, ctx, parseId(params.id));
  return { ok: true };
});
