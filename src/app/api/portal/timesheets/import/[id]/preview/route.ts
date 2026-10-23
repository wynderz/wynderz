import { parseId, readJson, route } from "@/lib/portal/api";
import { previewTimesheetImport } from "@/lib/portal/services/timesheets";

export const POST = route<{ id: string }>(async ({ req, params, db }) => previewTimesheetImport(db, parseId(params.id), await readJson(req)));
