import { queryObject, readJson, route } from "@/lib/portal/api";
import { listExpenses, createExpense } from "@/lib/portal/services/expenses";

export const GET = route(async ({ req, db }) => listExpenses(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createExpense(db, ctx, await readJson(req)));
