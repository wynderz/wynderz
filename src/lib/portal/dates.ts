/**
 * Date helpers. All business dates are plain ISO "YYYY-MM-DD" strings (Postgres `date`),
 * so there is no timezone drift between server, DB and browser.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toIsoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function todayIso() {
  // Business timezone is India (IST, UTC+5:30).
  const now = new Date(Date.now() + 330 * 60_000);
  return toIsoDate(now);
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Indian FY convention: April 1 – March 31. */
export function defaultFinancialYear(startYear: number) {
  const end = startYear + 1;
  return {
    label: `FY ${startYear}-${String(end).slice(-2)}`,
    startDate: `${startYear}-04-01`,
    endDate: `${end}-03-31`,
  };
}

/** FY start year containing a date (Indian convention). */
export function fyStartYearFor(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

export function firstOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function lastOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return toIsoDate(d);
}

export function daysInMonth(iso: string) {
  return Number(lastOfMonth(iso).slice(8, 10));
}

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Months (first-of-month ISO) between two dates inclusive. */
export function monthsBetween(start: string, end: string) {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function shortMonth(iso: string) {
  return MONTHS[Number(iso.slice(5, 7)) - 1];
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
export function timeToMinutes(t: string) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) throw new Error(`Invalid time: ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${t}`);
  return h * 60 + min;
}

export function minutesToHhmm(mins: number | null | undefined) {
  if (mins === null || mins === undefined) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${pad(m)}`;
}

export function minutesToHours(mins: number | null | undefined) {
  if (!mins) return "0.00";
  return (Math.round((mins / 60) * 100) / 100).toFixed(2);
}

/**
 * Timesheet hours: end - start - break. Overnight shifts (end < start) are rejected unless
 * explicitly allowed, because the company has not defined an overnight policy.
 */
export function computeWorkedMinutes(start: string, end: string, breakMinutes = 0, allowOvernight = false) {
  const s = timeToMinutes(start);
  let e = timeToMinutes(end);
  if (e <= s) {
    if (!allowOvernight) throw new Error("End time must be after start time.");
    e += 24 * 60;
  }
  const total = e - s - breakMinutes;
  if (total < 0) throw new Error("Break is longer than the time worked.");
  return total;
}
