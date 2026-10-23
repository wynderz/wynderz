import { parseId, readJson, route } from "@/lib/portal/api";
import { getProjectDashboard, updateProject } from "@/lib/portal/services/projects";

type P = { id: string };

export const GET = route<P>(async ({ params, db }) => getProjectDashboard(db, parseId(params.id)));
export const PATCH = route<P>(async ({ req, params, db, ctx }) => updateProject(db, ctx, parseId(params.id), await readJson(req)));
