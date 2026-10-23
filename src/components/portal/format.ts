/** Display helpers (client + server safe). Formatting only — never used for calculations. */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function formatINR(value: string | number | null | undefined, opts: { whole?: boolean } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return (opts.whole ? inr0 : inr).format(n);
}

/** ₹12.4 L / ₹1.2 Cr — for KPI cards and chart axes. */
export function compactINR(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e9 ? 0 : 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)} K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function formatNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return num.format(Number(value));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  const s = iso instanceof Date ? iso.toISOString() : iso;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

export function fmtDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function fmtMonth(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtTime(t: string | null | undefined) {
  return t ? t.slice(0, 5) : "—";
}

export function fmtHours(minutes: number | null | undefined) {
  if (!minutes) return "0:00";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function labelize(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ");
}

export type Tone = "success" | "warn" | "danger" | "info" | "lime" | "";

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "paid":
    case "present":
    case "completed":
    case "approved":
    case "received":
    case "active":
    case "open":
      return "success";
    case "partial":
    case "partially_paid":
    case "half_day":
    case "on_hold":
    case "ordered":
    case "pending":
    case "submitted":
    case "closed":
    case "missing_punch":
      return "warn";
    case "unpaid":
    case "absent":
    case "cancelled":
    case "rejected":
    case "inactive":
      return "danger";
    case "planned":
    case "issued":
    case "leave":
    case "draft":
      return "info";
    default:
      return "";
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
