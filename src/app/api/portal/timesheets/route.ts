import { queryObject, readJson, route } from "@/lib/portal/api";
import { listTimesheets, createTimesheet } from "@/lib/portal/services/timesheets";

export const GET = route(async ({ req, db }) => listTimesheets(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createTimesheet(db, ctx, await readJson(req)));
