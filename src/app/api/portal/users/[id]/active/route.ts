import { z } from "zod";
import { parseId, readJson, route } from "@/lib/portal/api";
import { setUserActive } from "@/lib/portal/services/users";

const body = z.object({ isActive: z.boolean() });

export const POST = route<{ id: string }>(async ({ req, params, db, ctx }) =>
  setUserActive(db, ctx, parseId(params.id), body.parse(await readJson(req)).isActive),
);
