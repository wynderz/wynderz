import { route } from "@/lib/portal/api";
import { AppError } from "@/lib/portal/errors";
import { listImportJobs, startImport } from "@/lib/portal/services/attendance";

export const GET = route(async ({ db }) => listImportJobs(db, "attendance"));

/** Step 1: upload the export (multipart field "file"). Returns sheets, headers and a suggested mapping. */
export const POST = route(async ({ req, db, ctx }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("Choose a file to upload.");
  return startImport(db, ctx, file, "attendance");
});
