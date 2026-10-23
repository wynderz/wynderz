import { parseId, readJson, route } from "@/lib/portal/api";
import { deleteTimesheet, updateTimesheet } from "@/lib/portal/services/timesheets";
import { reasonBody } from "@/lib/portal/validation";

type P = { id: string };

export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateTimesheet(db, ctx, parseId(params.id), await readJson(req)));

export const DELETE = route<P>(async ({ req, params, db, ctx }) => {
  const { correctionReason } = reasonBody.parse(await readJson(req).catch(() => ({})));
  await deleteTimesheet(db, ctx, parseId(params.id), correctionReason);
  return { ok: true };
});
