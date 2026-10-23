import { readJson, route } from "@/lib/portal/api";
import { createYear, listYears, suggestNextYear } from "@/lib/portal/services/financial-years";

export const GET = route(async ({ db }) => ({ years: await listYears(db), suggestion: await suggestNextYear(db) }));
export const POST = route(async ({ req, db, ctx }) => createYear(db, ctx, await readJson(req)));
