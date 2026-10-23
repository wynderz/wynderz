import { parseId, route } from "@/lib/portal/api";
import { readDocumentFile } from "@/lib/portal/services/documents";

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Authenticated download. Only PDFs/images may open inline, inside a locked-down sandbox. */
export const GET = route<{ id: string }>(async ({ req, params, db, ctx }) => {
  const { doc, bytes } = await readDocumentFile(db, ctx, parseId(params.id));
  const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE.has(doc.mimeType);
  const name = doc.originalName.replace(/[^\w.\- ()]+/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
});
