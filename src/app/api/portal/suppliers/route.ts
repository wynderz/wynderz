import { queryObject, readJson, route } from "@/lib/portal/api";
import { listSuppliers, createSupplier } from "@/lib/portal/services/suppliers";

export const GET = route(async ({ req, db }) => listSuppliers(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createSupplier(db, ctx, await readJson(req)));
