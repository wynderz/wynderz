type Bucket = { count: number; resetAt: number };

const attempts = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginAllowed(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true as const, remaining: MAX_ATTEMPTS - 1 };
  }
  if (current.count >= MAX_ATTEMPTS) {
    return { ok: false as const, retryAt: current.resetAt };
  }
  current.count += 1;
  return { ok: true as const, remaining: MAX_ATTEMPTS - current.count };
}

export function clearLoginAttempts(ip: string) {
  attempts.delete(ip);
}
