import { timingSafeEqual } from "crypto";

/** Constant-time check of "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this when CRON_SECRET is set). */
export function isAuthorizedCron(header: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
