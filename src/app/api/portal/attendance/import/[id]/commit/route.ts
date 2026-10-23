import { parseId, readJson, route } from "@/lib/portal/api";
import { commitImport } from "@/lib/portal/services/attendance";

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) => commitImport(db, ctx, parseId(params.id), await readJson(req)));
