import { queryObject, readJson, route } from "@/lib/portal/api";
import { createPayroll, listPayroll } from "@/lib/portal/services/payroll";

export const GET = route(async ({ req, db }) => listPayroll(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createPayroll(db, ctx, await readJson(req)));
