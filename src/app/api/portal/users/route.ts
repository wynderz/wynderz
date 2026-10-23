import { readJson, route } from "@/lib/portal/api";
import { createUser, listUsers } from "@/lib/portal/services/users";

export const GET = route(async ({ db }) => listUsers(db));
export const POST = route(async ({ req, db, ctx }) => createUser(db, ctx, await readJson(req)));
