import { parseId, readJson, route } from "@/lib/portal/api";
import { recordPayment } from "@/lib/portal/services/payroll";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => recordPayment(db, ctx, parseId(params.id), await readJson(req)));
