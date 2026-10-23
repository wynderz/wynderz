import { readJson, route } from "@/lib/portal/api";
import { generateMonth } from "@/lib/portal/services/payroll";

export const POST = route(async ({ req, db, ctx }) => generateMonth(db, ctx, await readJson(req)));
