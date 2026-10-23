import { queryObject, route } from "@/lib/portal/api";
import { AppError } from "@/lib/portal/errors";
import { listDocuments, uploadDocument } from "@/lib/portal/services/documents";

export const GET = route(async ({ req, db }) => listDocuments(db, queryObject(req)));

/** Multipart upload: "file" plus metadata fields (title, docType, projectId, ...). */
export const POST = route(async ({ req, db, ctx }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("Choose a file to upload.");
  const meta: Record<string, string> = {};
  for (const [k, v] of form!.entries()) if (k !== "file" && typeof v === "string") meta[k] = v;
  if (!meta.title) meta.title = file.name.replace(/\.[^.]+$/, "");
  return uploadDocument(db, ctx, file, meta);
});
