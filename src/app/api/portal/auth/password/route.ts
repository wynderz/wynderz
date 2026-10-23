import { readJson, route } from "@/lib/portal/api";
import { changeOwnPassword } from "@/lib/portal/services/users";

export const POST = route(async ({ req, db, ctx, session }) => {
  await changeOwnPassword(db, ctx, await readJson(req), session.sessionId);
  return { ok: true };
});
