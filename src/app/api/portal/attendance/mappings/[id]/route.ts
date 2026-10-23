import { parseId, route } from "@/lib/portal/api";
import { deleteMapping } from "@/lib/portal/services/attendance";

export const DELETE = route<{ id: string }>(async ({ params, db, ctx }) => {
  await deleteMapping(db, ctx, parseId(params.id));
  return { ok: true };
});
