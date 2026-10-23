import { queryObject, readJson, route } from "@/lib/portal/api";
import { listEmployees, createEmployee } from "@/lib/portal/services/employees";

export const GET = route(async ({ req, db }) => listEmployees(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createEmployee(db, ctx, await readJson(req)));
