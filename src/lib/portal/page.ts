import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getPortalSession } from "./auth/session";
import { getDb } from "./db";
import { yearOptions } from "./services/financial-years";

export const FY_COOKIE = "wz_fy";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Server pages call this first: validates the session against the DB or redirects to login. */
export async function requirePortal() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  return { session, db: getDb() };
}

export const getYears = cache(async () => yearOptions(getDb()));

/** Flattens Next.js search params into plain strings. */
export async function readParams(sp: SearchParams) {
  const raw = await sp;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== "") out[k] = val;
  }
  return out;
}

/**
 * The year selector in the top bar is stored in a cookie so it applies across modules.
 * `?fy=` in the URL overrides it; `fy=all` means every year.
 */
export async function selectedYear(params: Record<string, string>) {
  const years = await getYears();
  const fromUrl = params.fy;
  const fromCookie = (await cookies()).get(FY_COOKIE)?.value;
  const raw = fromUrl ?? fromCookie ?? "all";
  const id = raw === "all" ? undefined : Number(raw);
  const year = id ? years.find((y) => y.id === id) : undefined;
  return { fy: year?.id, year, years };
}

export { withParams } from "./url";
