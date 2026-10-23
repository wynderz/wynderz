import { parseId, readJson, route } from "@/lib/portal/api";
import { setYearStatus } from "@/lib/portal/services/financial-years";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => setYearStatus(db, ctx, parseId(params.id), await readJson(req)));
