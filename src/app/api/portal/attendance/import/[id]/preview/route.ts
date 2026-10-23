import { parseId, readJson, route } from "@/lib/portal/api";
import { previewImport } from "@/lib/portal/services/attendance";

export const POST = route<{ id: string }>(async ({ req, params, db }) => previewImport(db, parseId(params.id), await readJson(req)));
