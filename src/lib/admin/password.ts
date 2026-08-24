import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { timingSafeEqualString } from "@/lib/admin/session-token";

const KEYLEN = 64;

export function hashAdminPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyAdminPassword(password: string) {
  const hashed = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (hashed) {
    return verifyScrypt(password, hashed);
  }
  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) return false;
  return timingSafeEqualString(password, plain);
}

function verifyScrypt(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  if (!n || !r || !p || salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, { N: n, r, p });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function getAdminIdentity() {
  return (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || "").trim();
}
