import { parseId, readJson, route } from "@/lib/portal/api";
import { getMaterial, updateMaterial } from "@/lib/portal/services/materials";

type P = { id: string };

export const GET = route<P>(async ({ params, db }) => getMaterial(db, parseId(params.id)));
export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateMaterial(db, ctx, parseId(params.id), await readJson(req)));
