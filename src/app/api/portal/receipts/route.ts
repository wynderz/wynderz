import { queryObject, readJson, route } from "@/lib/portal/api";
import { listReceipts, createReceipt } from "@/lib/portal/services/receivables";

export const GET = route(async ({ req, db }) => listReceipts(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createReceipt(db, ctx, await readJson(req)));
