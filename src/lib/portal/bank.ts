/** Bank payment details for salary transfers. Pure helpers — safe to import from client components. */

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Indian bank account numbers are digits only, 9–18 long in practice; allow 6–20. */
export const ACCOUNT_RE = /^\d{6,20}$/;

/** Strips spaces and hyphens people paste from passbooks. */
export function cleanAccountNumber(v: string) {
  return v.replace(/[\s-]/g, "");
}

export function cleanIfsc(v: string) {
  return v.trim().toUpperCase();
}

/** "000011112222" → "••••2222". Everything except the edit form and the salary sheet uses this. */
export function maskAccount(v: string | null | undefined) {
  if (!v) return null;
  return `••••${v.slice(-4)}`;
}
