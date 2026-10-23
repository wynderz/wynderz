/**
 * Exact money arithmetic on paise (BigInt). Never use JS floats for money.
 * Inputs/outputs are decimal strings like "1234.50", matching Postgres numeric(14,2).
 */

const MONEY_RE = /^-?\d+(\.\d+)?$/;

export class MoneyError extends Error {}

/** Parse a decimal string/number into paise. Rounds half away from zero beyond 2 decimals. */
export function toPaise(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return BigInt(0);
  const raw = typeof value === "number" ? numberToString(value) : value.replace(/[,\s₹]/g, "");
  if (!MONEY_RE.test(raw)) throw new MoneyError(`Invalid amount: ${value}`);
  return scaledRound(raw, 2);
}

/** Paise -> "1234.50" */
export function fromPaise(paise: bigint): string {
  const neg = paise < BigInt(0);
  const abs = neg ? -paise : paise;
  const rupees = abs / BigInt(100);
  const cents = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${rupees}.${cents}`;
}

export function normalizeMoney(value: string | number | null | undefined) {
  return fromPaise(toPaise(value));
}

export function addMoney(...values: Array<string | number | null | undefined>) {
  return fromPaise(values.reduce<bigint>((sum, v) => sum + toPaise(v), BigInt(0)));
}

export function subMoney(a: string | number | null | undefined, b: string | number | null | undefined) {
  return fromPaise(toPaise(a) - toPaise(b));
}

export function maxMoney(a: string, b: string) {
  return toPaise(a) >= toPaise(b) ? normalizeMoney(a) : normalizeMoney(b);
}

export function compareMoney(a: string | number | null | undefined, b: string | number | null | undefined) {
  const x = toPaise(a);
  const y = toPaise(b);
  return x === y ? 0 : x > y ? 1 : -1;
}

/**
 * Multiply an amount by a decimal factor (e.g. quantity "2.5" or rate "0.18"),
 * rounding the result half-up to paise.
 */
export function mulMoney(amount: string | number, factor: string | number) {
  const f = typeof factor === "number" ? numberToString(factor) : factor.trim();
  if (!MONEY_RE.test(f)) throw new MoneyError(`Invalid factor: ${factor}`);
  const [intPart, frac = ""] = f.replace("-", "").split(".");
  const scale = frac.length;
  const factorScaled = BigInt(intPart + frac) * (f.startsWith("-") ? BigInt(-1) : BigInt(1));
  const product = toPaise(amount) * factorScaled;
  return fromPaise(divRound(product, BigInt(10) ** BigInt(scale)));
}

/** amount * percent / 100, half-up. */
export function percentOf(amount: string | number, percent: string | number) {
  const p = typeof percent === "number" ? numberToString(percent) : percent;
  const product = toPaise(amount) * scaledRound(p, 4);
  return fromPaise(divRound(product, BigInt(1_000_000)));
}

/** Prorate: amount * numerator / denominator, half-up. Used for days-paid salary. */
export function prorate(amount: string, numerator: string | number, denominator: string | number) {
  const num = scaledRound(typeof numerator === "number" ? numberToString(numerator) : numerator, 4);
  const den = scaledRound(typeof denominator === "number" ? numberToString(denominator) : denominator, 4);
  if (den === BigInt(0)) throw new MoneyError("Cannot prorate over zero days.");
  return fromPaise(divRound(toPaise(amount) * num, den));
}

export function isZero(value: string | number | null | undefined) {
  return toPaise(value) === BigInt(0);
}

/** Derives payment status from total vs paid. */
export function derivePaymentStatus(total: string, paid: string): "unpaid" | "partial" | "paid" {
  const t = toPaise(total);
  const p = toPaise(paid);
  if (p <= BigInt(0)) return t === BigInt(0) ? "paid" : "unpaid";
  return p >= t ? "paid" : "partial";
}

/** Base + GST computation used by expenses, materials and invoices. */
export function computeTax(input: {
  baseAmount?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  gstRate?: string | null;
}) {
  let base: string;
  if (input.baseAmount !== undefined && input.baseAmount !== null && input.baseAmount !== "") {
    base = normalizeMoney(input.baseAmount);
  } else if (input.unitPrice && input.quantity) {
    base = mulMoney(input.unitPrice, input.quantity);
  } else {
    throw new MoneyError("Provide a base amount, or a quantity and unit price.");
  }
  const gstRate = input.gstRate && input.gstRate !== "" ? input.gstRate : "0";
  const gstAmount = percentOf(base, gstRate);
  return { baseAmount: base, gstRate: normalizeRate(gstRate), gstAmount, totalAmount: addMoney(base, gstAmount) };
}

export function normalizeRate(rate: string | number) {
  const p = scaledRound(typeof rate === "number" ? numberToString(rate) : rate, 2);
  return fromPaise(p);
}

/* -------------------------------------------------------------- internals */

function numberToString(n: number) {
  if (!Number.isFinite(n)) throw new MoneyError(`Invalid amount: ${n}`);
  // toFixed(6) avoids exponent notation; extra digits are rounded by scaledRound.
  return n.toFixed(6);
}

/** Converts a decimal string into an integer scaled by 10^scale, rounding half away from zero. */
function scaledRound(raw: string, scale: number): bigint {
  const s = raw.trim();
  if (!MONEY_RE.test(s)) throw new MoneyError(`Invalid number: ${raw}`);
  const neg = s.startsWith("-");
  const [intPart, frac = ""] = s.replace("-", "").split(".");
  const kept = (frac + "0".repeat(scale)).slice(0, scale);
  let value = BigInt(intPart + kept);
  const next = frac.charAt(scale);
  if (next && Number(next) >= 5) value += BigInt(1);
  return neg ? -value : value;
}

function divRound(numerator: bigint, denominator: bigint) {
  const neg = numerator < BigInt(0) !== denominator < BigInt(0);
  const n = numerator < BigInt(0) ? -numerator : numerator;
  const d = denominator < BigInt(0) ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * BigInt(2) >= d) q += BigInt(1);
  return neg ? -q : q;
}
