import { parseId, readJson, route } from "@/lib/portal/api";
import { getEmployee, updateEmployee } from "@/lib/portal/services/employees";

type P = { id: string };

export const GET = route<P>(async ({ params, db }) => getEmployee(db, parseId(params.id)));
export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateEmployee(db, ctx, parseId(params.id), await readJson(req)));
