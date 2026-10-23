import { queryObject, readJson, route } from "@/lib/portal/api";
import { listProjects, createProject } from "@/lib/portal/services/projects";

export const GET = route(async ({ req, db }) => listProjects(db, queryObject(req)));
export const POST = route(async ({ req, db, ctx }) => createProject(db, ctx, await readJson(req)));
