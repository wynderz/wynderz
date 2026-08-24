export const SESSION_COOKIE = "wynderz_admin";
export const SESSION_MAX_AGE = 60 * 60 * 12;

export type AdminSession = {
  username: string;
  exp: number;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.ADMIN_SESSION_SECRET || "";
  return secret.length >= 32 ? secret : "";
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(username: string) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET (or ADMIN_SESSION_SECRET) is missing or shorter than 32 characters.");
  }
  const payload: AdminSession = {
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(secret, body);
  return `${body}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  const secret = getSecret();
  if (!secret || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(secret, body);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as AdminSession;
    if (!payload?.username || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function timingSafeEqualString(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}
