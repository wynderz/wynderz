import { queryObject, readJson, route } from "@/lib/portal/api";
import { createEmployee, listEmployees, maskEmployee } from "@/lib/portal/services/employees";

export const GET = route(async ({ req, db }) => {
  const page = await listEmployees(db, queryObject(req));
  return { ...page, rows: page.rows.map(maskEmployee) };
});
export const POST = route(async ({ req, db, ctx }) => maskEmployee(await createEmployee(db, ctx, await readJson(req))));
