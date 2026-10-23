import { queryObject, readJson, route } from "@/lib/portal/api";
import { attendanceRecordsInRange, saveManualAttendance } from "@/lib/portal/services/attendance";

export const GET = route(async ({ req, db }) => attendanceRecordsInRange(db, queryObject(req)));
/** Create or replace the manual record for an employee + date. */
export const POST = route(async ({ req, db, ctx }) => saveManualAttendance(db, ctx, await readJson(req)));
