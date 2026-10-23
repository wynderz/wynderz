/**
 * Pure attendance logic: maps device rows to punches/daily records and applies the
 * configurable policy. No DB access here so it is fully unit-testable.
 */
import { addDays, pad } from "./dates";
import { cellToString, parseDateCell, parseDateTimeCell, parseTimeCell, type Cell, type DateOrder } from "./spreadsheet";

export type AttendancePolicy = {
  shiftStart: string;
  graceMinutes: number;
  halfDayMinHours: number;
  fullDayMinHours: number;
  punchPolicy: "first_last" | "pairs";
  duplicatePunchMinutes: number;
  dayCutoff: string;
  weeklyOffDays: number[];
};

export type AttendanceMapping = {
  sheet: string;
  headerRow: number;
  /** punches: one row per punch. daily: one row per employee per day (in/out columns). */
  layout: "punches" | "daily";
  employeeMatch: "device_user_id" | "employee_code" | "name";
  dateOrder: DateOrder;
  columns: {
    employee: number;
    /** punches layout: a combined date-time column, or date + time columns. */
    dateTime?: number | null;
    date?: number | null;
    time?: number | null;
    /** daily layout */
    inTime?: number | null;
    outTime?: number | null;
    status?: number | null;
    deviceId?: number | null;
  };
};

export type EmployeeRef = { id: number; name: string; employeeCode: string; deviceUserId: string | null };

export type Issue = { row: number; level: "error" | "warning"; message: string };

export type Punch = { employeeId: number; workDate: string; minutes: number; punchedAt: string; deviceId: string | null; row: number };

export type DailyRecord = {
  employeeId: number;
  workDate: string;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number | null;
  punchCount: number;
  status: "present" | "absent" | "half_day" | "leave" | "missing_punch" | "holiday" | "weekly_off";
  isLate: boolean;
  notes: string | null;
};

export const minutesToTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}:00`;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function normalizeKey(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, " ").replace(/^0+(?=\d)/, "");
}

export function buildEmployeeIndex(employees: EmployeeRef[], match: AttendanceMapping["employeeMatch"]) {
  const index = new Map<string, EmployeeRef[]>();
  for (const e of employees) {
    const key = match === "device_user_id" ? e.deviceUserId : match === "employee_code" ? e.employeeCode : e.name;
    if (!key) continue;
    const k = normalizeKey(key);
    index.set(k, [...(index.get(k) ?? []), e]);
  }
  return index;
}

/** Status text from device exports -> our status (or null when unrecognized). */
export function mapStatusText(raw: string): DailyRecord["status"] | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (["p", "present", "pr", "ok"].includes(s)) return "present";
  if (["a", "ab", "absent"].includes(s)) return "absent";
  if (["hd", "half day", "half-day", "halfday", "h", "1/2"].includes(s)) return "half_day";
  if (["l", "leave", "cl", "sl", "el", "pl", "lv"].includes(s)) return "leave";
  if (["wo", "w/o", "weekly off", "week off", "off"].includes(s)) return "weekly_off";
  if (["ho", "hol", "holiday", "ph"].includes(s)) return "holiday";
  if (["mp", "miss", "missing", "missing punch", "mis"].includes(s)) return "missing_punch";
  return null;
}

/** Turns one day's punch minutes into a daily record using the policy. */
export function summarizeDay(employeeId: number, workDate: string, minutesList: number[], policy: AttendancePolicy): DailyRecord {
  const sorted = [...minutesList].sort((a, b) => a - b);
  // Collapse double scans.
  const punches: number[] = [];
  for (const m of sorted) {
    if (!punches.length || m - punches[punches.length - 1] > policy.duplicatePunchMinutes) punches.push(m);
  }
  const base: DailyRecord = {
    employeeId,
    workDate,
    firstIn: punches.length ? minutesToTime(punches[0]) : null,
    lastOut: punches.length > 1 ? minutesToTime(punches[punches.length - 1]) : null,
    workedMinutes: null,
    punchCount: punches.length,
    status: "absent",
    isLate: false,
    notes: null,
  };
  if (!punches.length) return base;
  base.isLate = punches[0] > toMin(policy.shiftStart) + policy.graceMinutes;
  if (punches.length === 1) return { ...base, status: "missing_punch", notes: "Only one punch recorded" };

  let worked: number;
  let oddPairs = false;
  if (policy.punchPolicy === "pairs") {
    worked = 0;
    for (let i = 0; i + 1 < punches.length; i += 2) worked += punches[i + 1] - punches[i];
    oddPairs = punches.length % 2 === 1;
  } else {
    worked = punches[punches.length - 1] - punches[0];
  }
  base.workedMinutes = worked;
  if (oddPairs) return { ...base, status: "missing_punch", notes: `Odd number of punches (${punches.length})` };
  if (worked >= policy.fullDayMinHours * 60) return { ...base, status: "present" };
  if (worked >= policy.halfDayMinHours * 60) return { ...base, status: "half_day" };
  return { ...base, status: "absent", notes: "Worked less than the half-day threshold" };
}

type Parsed = {
  punches: Punch[];
  daily: DailyRecord[];
  issues: Issue[];
  unmatched: Map<string, number>;
  ambiguous: Set<string>;
  totalRows: number;
  skippedRows: number;
  inFileDuplicates: number;
  period: { start: string | null; end: string | null };
};

/**
 * Parses device rows according to the mapping. Unmatched employees are reported, never created.
 */
export function parseAttendanceRows(rows: Cell[][], mapping: AttendanceMapping, employees: EmployeeRef[], policy: AttendancePolicy): Parsed {
  const index = buildEmployeeIndex(employees, mapping.employeeMatch);
  const issues: Issue[] = [];
  const unmatched = new Map<string, number>();
  const ambiguous = new Set<string>();
  const punches: Punch[] = [];
  const daily: DailyRecord[] = [];
  const seenPunch = new Set<string>();
  const seenDay = new Set<string>();
  let skippedRows = 0;
  let inFileDuplicates = 0;
  let start: string | null = null;
  let end: string | null = null;
  const cutoff = toMin(policy.dayCutoff);
  const c = mapping.columns;
  const dataRows = rows.slice(mapping.headerRow);
  const get = (r: Cell[], i?: number | null) => (i === null || i === undefined ? null : (r[i] ?? null));
  const track = (d: string) => {
    if (!start || d < start) start = d;
    if (!end || d > end) end = d;
  };

  dataRows.forEach((r, i) => {
    const rowNo = mapping.headerRow + i + 1;
    if (!r || r.every((v) => v === null || v === "")) {
      skippedRows++;
      return;
    }
    const keyRaw = cellToString(get(r, c.employee));
    if (!keyRaw) {
      issues.push({ row: rowNo, level: "error", message: "Missing employee identifier" });
      return;
    }
    const matches = index.get(normalizeKey(keyRaw));
    if (!matches) {
      unmatched.set(keyRaw, (unmatched.get(keyRaw) ?? 0) + 1);
      return;
    }
    if (matches.length > 1) {
      ambiguous.add(keyRaw);
      issues.push({ row: rowNo, level: "error", message: `"${keyRaw}" matches ${matches.length} employees — use device ID or employee ID matching` });
      return;
    }
    const emp = matches[0];
    const deviceId = c.deviceId !== undefined && c.deviceId !== null ? cellToString(get(r, c.deviceId)) || null : null;

    if (mapping.layout === "punches") {
      let date: string | null = null;
      let minutes: number | null = null;
      if (c.dateTime !== undefined && c.dateTime !== null) {
        const dt = parseDateTimeCell(get(r, c.dateTime), mapping.dateOrder);
        if (dt) ({ date, minutes } = dt);
      } else {
        date = parseDateCell(get(r, c.date), mapping.dateOrder);
        minutes = parseTimeCell(get(r, c.time));
      }
      if (!date) return issues.push({ row: rowNo, level: "error", message: "Invalid or missing date" });
      if (minutes === null) return issues.push({ row: rowNo, level: "error", message: "Invalid or missing punch time" });
      const workDate = cutoff > 0 && minutes < cutoff ? addDays(date, -1) : date;
      const punchedAt = `${date} ${minutesToTime(minutes)}`;
      const k = `${emp.id}|${punchedAt}`;
      if (seenPunch.has(k)) {
        inFileDuplicates++;
        return;
      }
      seenPunch.add(k);
      track(workDate);
      punches.push({ employeeId: emp.id, workDate, minutes: workDate === date ? minutes : minutes + 1440, punchedAt, deviceId, row: rowNo });
    } else {
      const date = parseDateCell(get(r, c.date), mapping.dateOrder);
      if (!date) return issues.push({ row: rowNo, level: "error", message: "Invalid or missing date" });
      const k = `${emp.id}|${date}`;
      if (seenDay.has(k)) {
        inFileDuplicates++;
        issues.push({ row: rowNo, level: "warning", message: `Duplicate row for ${emp.name} on ${date} — first row kept` });
        return;
      }
      seenDay.add(k);
      track(date);
      const inM = parseTimeCell(get(r, c.inTime));
      const outM = parseTimeCell(get(r, c.outTime));
      const statusText = cellToString(get(r, c.status));
      const mapped = statusText ? mapStatusText(statusText) : null;
      if (statusText && !mapped) issues.push({ row: rowNo, level: "warning", message: `Unknown status "${statusText}" — derived from times instead` });
      const times = [inM, outM].filter((m): m is number => m !== null);
      let rec = summarizeDay(emp.id, date, times, { ...policy, duplicatePunchMinutes: 0 });
      if (outM !== null && inM !== null && outM < inM) {
        issues.push({ row: rowNo, level: "warning", message: "Out time is before in time" });
        // Sorting would silently swap in/out and count the reversed span as worked time.
        rec = { ...rec, firstIn: minutesToTime(inM), lastOut: minutesToTime(outM), workedMinutes: null, status: "missing_punch", notes: "Out time is before in time" };
      }
      if (mapped && (mapped !== "present" || !times.length)) {
        rec = { ...rec, status: mapped, workedMinutes: mapped === "absent" || mapped === "leave" ? null : rec.workedMinutes };
      }
      daily.push(rec);
    }
  });

  if (mapping.layout === "punches") {
    const groups = new Map<string, Punch[]>();
    for (const p of punches) {
      const k = `${p.employeeId}|${p.workDate}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    for (const [k, list] of groups) {
      const [empId, workDate] = k.split("|");
      daily.push(summarizeDay(Number(empId), workDate, list.map((p) => p.minutes), policy));
    }
  }

  return {
    punches,
    daily,
    issues,
    unmatched,
    ambiguous,
    totalRows: dataRows.length,
    skippedRows,
    inFileDuplicates,
    period: { start, end },
  };
}

/** Suggests a mapping from header names. */
export function suggestMapping(headers: string[]): Partial<AttendanceMapping["columns"]> & { layout: AttendanceMapping["layout"]; employeeMatch: AttendanceMapping["employeeMatch"] } {
  const find = (...patterns: RegExp[]) => {
    const i = headers.findIndex((h) => patterns.some((p) => p.test(h)));
    return i >= 0 ? i : null;
  };
  const idCol = find(/^(ac[- ]?no|user ?id|emp(loyee)? ?(id|code|no)|enroll(ment)? ?(id|no)|badge|id)\.?$/i);
  const nameCol = find(/name/i);
  const dateTime = find(/date ?time|check ?time|punch ?time|log ?time|timestamp/i);
  const inTime = find(/^(in|in ?time|check ?in|clock ?in|first ?in|on ?duty)$/i);
  const outTime = find(/^(out|out ?time|check ?out|clock ?out|last ?out|off ?duty)$/i);
  const date = find(/^date$|att(endance)? ?date|work ?date|^day$/i);
  const time = find(/^time$/i);
  const status = find(/status|state/i);
  const device = find(/device|machine|terminal/i);
  const layout = inTime !== null || outTime !== null ? "daily" : "punches";
  return {
    layout,
    employeeMatch: idCol !== null ? "device_user_id" : "name",
    employee: (idCol ?? nameCol ?? 0) as number,
    dateTime: layout === "punches" && dateTime !== null ? dateTime : null,
    date: date,
    time: layout === "punches" && dateTime === null ? time : null,
    inTime,
    outTime,
    status,
    deviceId: device,
  };
}
