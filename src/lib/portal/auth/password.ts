import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2) with OWASP-recommended baseline parameters.
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;

export function validatePasswordStrength(password: string) {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > 200) return "Password is too long.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Password must contain letters and numbers.";
  return null;
}

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string) {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Used to keep login timing similar when the email does not exist. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  dummyHash ??= hashPassword("not-a-real-password-0");
  return dummyHash;
}
