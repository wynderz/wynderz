import { queryObject, readJson, route } from "@/lib/portal/api";
import { listMaterials, createMaterial } from "@/lib/portal/services/materials";

export const GET = route(async ({ req, db }) => listMaterials(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createMaterial(db, ctx, await readJson(req)));
