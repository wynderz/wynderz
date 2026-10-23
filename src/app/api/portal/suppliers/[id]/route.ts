import { parseId, readJson, route } from "@/lib/portal/api";
import { getSupplier, updateSupplier } from "@/lib/portal/services/suppliers";

type P = { id: string };

export const GET = route<P>(async ({ params, db }) => getSupplier(db, parseId(params.id)));
export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateSupplier(db, ctx, parseId(params.id), await readJson(req)));
