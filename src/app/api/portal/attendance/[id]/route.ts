import { parseId, readJson, route } from "@/lib/portal/api";
import { deleteAttendance } from "@/lib/portal/services/attendance";
import { reasonBody } from "@/lib/portal/validation";

export const DELETE = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const { correctionReason } = reasonBody.parse(await readJson(req).catch(() => ({})));
  await deleteAttendance(db, ctx, parseId(params.id), correctionReason);
  return { ok: true };
});
