import { parseId, readJson, route } from "@/lib/portal/api";
import { updateInvoice } from "@/lib/portal/services/receivables";

type P = { id: string };

export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateInvoice(db, ctx, parseId(params.id), await readJson(req)));
