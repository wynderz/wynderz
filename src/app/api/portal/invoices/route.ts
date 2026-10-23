import { queryObject, readJson, route } from "@/lib/portal/api";
import { listInvoices, createInvoice } from "@/lib/portal/services/receivables";

export const GET = route(async ({ req, db }) => listInvoices(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createInvoice(db, ctx, await readJson(req)));
