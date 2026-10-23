import { z } from "zod";
import { parseId, readJson, route } from "@/lib/portal/api";
import { commitTimesheetImport } from "@/lib/portal/services/timesheets";
import { optText } from "@/lib/portal/validation";

const body = z.object({ mapping: z.unknown(), saveMappingName: optText(80), correctionReason: optText(500) });

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) =>
  commitTimesheetImport(db, ctx, parseId(params.id), body.parse(await readJson(req))),
);
