import { z } from "zod";
import { readJson, route } from "@/lib/portal/api";
import { getAllSettings, updateSetting } from "@/lib/portal/services/settings";

const body = z.object({ key: z.string(), value: z.unknown() });

export const GET = route(async ({ db }) => getAllSettings(db));
export const PUT = route(async ({ req, db, ctx }) => {
  const { key, value } = body.parse(await readJson(req));
  return updateSetting(db, ctx, key, value);
});
