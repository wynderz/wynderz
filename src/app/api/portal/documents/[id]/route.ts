import { parseId, readJson, route } from "@/lib/portal/api";
import { getDocument, updateDocument } from "@/lib/portal/services/documents";

type P = { id: string };

export const GET = route<P>(async ({ params, db }) => getDocument(db, parseId(params.id)));
export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateDocument(db, ctx, parseId(params.id), await readJson(req)));
