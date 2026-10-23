import { parseId, readJson, route } from "@/lib/portal/api";
import { getExpense, updateExpense } from "@/lib/portal/services/expenses";

type P = { id: string };

export const GET = route<P>(async ({ params, db }) => getExpense(db, parseId(params.id)));
export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateExpense(db, ctx, parseId(params.id), await readJson(req)));
