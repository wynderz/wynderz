import { readJson, route } from "@/lib/portal/api";
import { createCategory, listCategories } from "@/lib/portal/services/categories";

export const GET = route(async ({ db }) => listCategories(db));
export const POST = route(async ({ req, db, ctx }) => createCategory(db, ctx, await readJson(req)));
