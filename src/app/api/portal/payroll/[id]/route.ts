import { parseId, readJson, route } from "@/lib/portal/api";
import { deletePayroll, updatePayroll } from "@/lib/portal/services/payroll";
import { reasonBody } from "@/lib/portal/validation";

type P = { id: string };

export const PATCH = route<P>(async ({ req, params, db, ctx }) => updatePayroll(db, ctx, parseId(params.id), await readJson(req)));
export const DELETE = route<P>(async ({ req, params, db, ctx }) => {
  const { correctionReason } = reasonBody.parse(await readJson(req).catch(() => ({})));
  await deletePayroll(db, ctx, parseId(params.id), correctionReason);
  return { ok: true };
});
