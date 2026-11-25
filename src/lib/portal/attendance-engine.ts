/**
 * Pure attendance logic: maps device rows to punches/daily records and applies the
 * configurable policy. No DB access here so it is fully unit-testable.
 */
import { addDays, pad } from "./dates";
import { cellToString, parseDateCell, parseDateTimeCell, parseTimeCell, type Cell, type DateOrder, type Sheet } from "./spreadsheet";

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
  /**
   * punches: one row per punch. daily: one row per employee per day (in/out columns).
   * register: monthly attendance register — a DATE column, one column per employee, marks (P/ABSENT/holiday text)
   * in the cells; header rows and blocks are detected automatically, so `headerRow`/`columns` are ignored.
   */
  layout: "punches" | "daily" | "register";
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

export type EmployeeRef = {
  id: number;
  name: string;
  employeeCode: string;
  deviceUserId: string | null;
  joiningDate?: string | null;
  exitDate?: string | null;
};

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

export type Parsed = {
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

/* ------------------------------------------------------------------ attendance register (grid) */

/**
 * The register format exported for Wynderz: one sheet per month (or several blocks per sheet), a title row,
 * a header row "DATE | <employee> | <employee> …", one row per date and a mark per employee:
 *   P / p / "P(mumbai trip)" = present · ABSENT / A = absent · blank = no record
 *   a whole row of text (TUESDAY HOLIDAY, DIWALI, TUE, "Gandhi jayanti") = weekly off / holiday for everyone
 * Blocks whose title says "over time" hold overtime notes, which are attached to that day's record.
 */
export type RegisterBlock = {
  sheet: string;
  /** 1-based row number of the DATE header. */
  headerRow: number;
  /** 0-based column index of the DATE column. */
  dateCol: number;
  /** One entry per employee column (0-based index + header text). */
  names: Array<{ col: number; name: string }>;
  overtime: boolean;
  title: string;
};

const isDateHeader = (v: Cell) => typeof v === "string" && /^\s*date\s*$/i.test(v);
const isNameHeader = (v: Cell) => typeof v === "string" && /[a-z]/i.test(v) && !isDateHeader(v);

/** Finds every DATE-header block in a sheet. A block's employee columns run until another DATE column or two blank columns. */
export function findRegisterBlocks(sheet: Sheet): RegisterBlock[] {
  const blocks: RegisterBlock[] = [];
  sheet.rows.forEach((row, r) => {
    (row ?? []).forEach((cell, c) => {
      if (!isDateHeader(cell)) return;
      const names: RegisterBlock["names"] = [];
      let blanks = 0;
      for (let j = c + 1; j < row.length; j++) {
        const v = row[j];
        if (isDateHeader(v)) break;
        if (v === null || v === "") {
          if (++blanks >= 2) break;
          continue;
        }
        blanks = 0;
        if (isNameHeader(v)) names.push({ col: j, name: cellToString(v) });
      }
      if (names.length < 1) return;
      const last = names[names.length - 1].col;
      // The block title sits in the rows just above the header (often a merged cell).
      const titleParts: string[] = [];
      for (let up = r - 1; up >= Math.max(0, r - 3); up--) {
        for (let j = c; j <= last; j++) {
          const t = cellToString(sheet.rows[up]?.[j] ?? null);
          if (t && !titleParts.includes(t)) titleParts.push(t);
        }
        if (titleParts.length) break;
      }
      const title = titleParts.join(" ").replace(/\s+/g, " ").trim();
      blocks.push({ sheet: sheet.name, headerRow: r + 1, dateCol: c, names, overtime: /over\s*-?\s*time|\bO\.?T\.?\b/i.test(title), title });
    });
  });
  return blocks;
}

export function isRegisterSheet(sheet: Sheet) {
  return findRegisterBlocks(sheet).some((b) => !b.overtime && b.names.length >= 1);
}

type Mark =
  | { kind: "blank" }
  | { kind: "status"; status: DailyRecord["status"]; note: string | null; attendance: boolean }
  | { kind: "unknown"; text: string };

const WEEKDAY = /\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b|week(ly)?\s*off/i;
const HOLIDAY = /holiday|holi\b|jayanti|diwali|deepavali|dussehra|dasara|dussera|navratri|pongal|sankranti|ugadi|eid|bakrid|ramzan|christmas|new\s*year|independence|republic|festival|bandh|closed|vacation/i;

/** Interprets one register cell. `attendance` = a real per-person mark (present/absent/half/leave), not a day-wide text. */
export function classifyRegisterMark(v: Cell): Mark {
  if (v === null || v === "") return { kind: "blank" };
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean") return { kind: "unknown", text: cellToString(v) };
  const text = v.replace(/\s+/g, " ").trim();
  if (!text) return { kind: "blank" };
  const present = /^p(?:resent)?\b\s*(?:[-(:]\s*(.*?)\)?)?\s*$/i.exec(text) ?? /^p\s*\((.*)\)\s*$/i.exec(text);
  if (present) return { kind: "status", status: "present", note: present[1]?.trim() || null, attendance: true };
  const mapped = mapStatusText(text);
  if (mapped && mapped !== "weekly_off" && mapped !== "holiday") return { kind: "status", status: mapped, note: null, attendance: true };
  if (/^(absent|ab|a)\b/i.test(text)) return { kind: "status", status: "absent", note: null, attendance: true };
  if (/half[\s-]*day|^hd\b/i.test(text)) return { kind: "status", status: "half_day", note: null, attendance: true };
  if (/\bleave\b/i.test(text)) return { kind: "status", status: "leave", note: text, attendance: true };
  if (mapped === "weekly_off" || WEEKDAY.test(text)) return { kind: "status", status: "weekly_off", note: text, attendance: false };
  if (mapped === "holiday" || HOLIDAY.test(text)) return { kind: "status", status: "holiday", note: text, attendance: false };
  return { kind: "unknown", text };
}

function overtimeNote(v: Cell): string | null {
  if (v === null || v === "") return null;
  if (v instanceof Date) {
    // Time-only Excel values come through as 1899-12-30 hh:mm.
    if (v.getUTCFullYear() < 1990) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    return null;
  }
  const t = cellToString(v).replace(/\s+/g, " ").trim();
  const m = classifyRegisterMark(t);
  if (m.kind === "status" && m.status !== "present") return null; // ABSENT / holiday rows carry no overtime
  return t || null;
}

/** Register header names → employees: biometric device user ID first, then full name, then a unique first-name match. */
export function buildRegisterMatcher(employees: EmployeeRef[]) {
  const byDevice = buildEmployeeIndex(employees, "device_user_id");
  const byName = buildEmployeeIndex(employees, "name");
  const byFirst = new Map<string, EmployeeRef[]>();
  for (const e of employees) {
    const first = normalizeKey(e.name).split(" ")[0];
    if (first) byFirst.set(first, [...(byFirst.get(first) ?? []), e]);
  }
  return (raw: string): { emp: EmployeeRef; via: "device" | "name" | "first_name" } | { error: "unmatched" | "ambiguous"; count?: number } => {
    const k = normalizeKey(raw);
    for (const [index, via] of [
      [byDevice, "device"],
      [byName, "name"],
    ] as const) {
      const hit = index.get(k);
      if (hit?.length === 1) return { emp: hit[0], via };
      if (hit && hit.length > 1) return { error: "ambiguous", count: hit.length };
    }
    if (!k.includes(" ")) {
      const hit = byFirst.get(k);
      if (hit?.length === 1) return { emp: hit[0], via: "first_name" };
      if (hit && hit.length > 1) return { error: "ambiguous", count: hit.length };
    }
    return { error: "unmatched" };
  };
}

const withinEmployment = (e: EmployeeRef, d: string) => (!e.joiningDate || e.joiningDate <= d) && (!e.exitDate || e.exitDate >= d);

/**
 * Parses attendance-register sheets (`sheetName` = one sheet, or "*" for every sheet that contains a register).
 * Day-wide holiday/weekly-off rows are applied only to employees who have real marks in that block and are
 * employed on that date, so people who had not joined yet never get paid off-days.
 */
export function parseRegister(sheets: Sheet[], sheetName: string, employees: EmployeeRef[], dateOrder: DateOrder = "auto"): Parsed & { blocks: RegisterBlock[] } {
  const match = buildRegisterMatcher(employees);
  const issues: Issue[] = [];
  const unmatched = new Map<string, number>();
  const ambiguous = new Set<string>();
  const firstNameMatches = new Map<string, string>();
  const daily = new Map<string, DailyRecord>();
  const overtime = new Map<string, string[]>();
  let totalRows = 0;
  let skippedRows = 0;
  let inFileDuplicates = 0;
  let start: string | null = null;
  let end: string | null = null;
  const allBlocks: RegisterBlock[] = [];

  const targets = sheetName === "*" ? sheets : sheets.filter((s) => s.name === sheetName);
  for (const sheet of targets) {
    const blocks = findRegisterBlocks(sheet);
    allBlocks.push(...blocks);
    // A block's data runs until the next header row in the same DATE column (or the end of the sheet).
    const headerRowsByCol = new Map<number, number[]>();
    for (const b of blocks) headerRowsByCol.set(b.dateCol, [...(headerRowsByCol.get(b.dateCol) ?? []), b.headerRow]);

    for (const block of [...blocks].sort((a, b) => Number(a.overtime) - Number(b.overtime))) {
      const nextHeader = (headerRowsByCol.get(block.dateCol) ?? []).filter((h) => h > block.headerRow).sort((a, b) => a - b)[0] ?? sheet.rows.length + 1;
      const cols = block.names.map((n) => {
        const m = match(n.name);
        if ("emp" in m) {
          if (m.via === "first_name") firstNameMatches.set(n.name.trim(), m.emp.name);
          return { ...n, emp: m.emp as EmployeeRef | null, error: null as "unmatched" | "ambiguous" | null };
        }
        return { ...n, emp: null as EmployeeRef | null, error: m.error as "unmatched" | "ambiguous" | null };
      });
      const rows: Array<{ rowNo: number; date: string; cells: Cell[] }> = [];
      for (let r = block.headerRow; r < nextHeader - 1 && r < sheet.rows.length; r++) {
        const row = sheet.rows[r] ?? [];
        const rowNo = r + 1;
        const cells = cols.map((c) => row[c.col] ?? null);
        const hasContent = row[block.dateCol] !== null && row[block.dateCol] !== undefined ? true : cells.some((v) => v !== null);
        if (!hasContent) continue;
        const date = parseDateCell(row[block.dateCol] ?? null, dateOrder);
        if (!date) {
          if (!block.overtime) skippedRows++;
          continue;
        }
        rows.push({ rowNo, date, cells });
      }

      if (block.overtime) {
        for (const { date, cells } of rows) {
          cells.forEach((v, i) => {
            const emp = cols[i].emp;
            const note = overtimeNote(v);
            if (!emp || !note) return;
            const k = `${emp.id}|${date}`;
            overtime.set(k, [...(overtime.get(k) ?? []), note]);
          });
        }
        continue;
      }

      // Each employee's span of real marks in this block (first..last date). Day-wide holidays are applied only
      // inside it, so someone who joined mid-month (or left) is not given paid off-days outside their working span.
      const span = new Map<number, { from: string; to: string }>();
      for (const { date, cells } of rows) {
        cells.forEach((v, i) => {
          const m = classifyRegisterMark(v);
          const emp = cols[i].emp;
          if (!(m.kind === "status" && m.attendance && emp)) return;
          const cur = span.get(emp.id);
          span.set(emp.id, { from: !cur || date < cur.from ? date : cur.from, to: !cur || date > cur.to ? date : cur.to });
        });
      }
      // People marked on the block's first (last) working day were there from its start (to its end), which
      // keeps a holiday on day 1 (e.g. Diwali) for everyone who was employed.
      const spans = [...span.values()];
      if (spans.length && rows.length) {
        const firstMarked = spans.reduce((m, x) => (x.from < m ? x.from : m), spans[0].from);
        const lastMarked = spans.reduce((m, x) => (x.to > m ? x.to : m), spans[0].to);
        const blockStart = rows.reduce((m, x) => (x.date < m ? x.date : m), rows[0].date);
        const blockEnd = rows.reduce((m, x) => (x.date > m ? x.date : m), rows[0].date);
        for (const sp of span.values()) {
          if (sp.from === firstMarked) sp.from = blockStart;
          if (sp.to === lastMarked) sp.to = blockEnd;
        }
      }
      const inSpan = (empId: number, d: string) => {
        const sp = span.get(empId);
        return !!sp && sp.from <= d && d <= sp.to;
      };

      for (const { rowNo, date, cells } of rows) {
        totalRows++;
        const marks = cells.map(classifyRegisterMark);
        const hasPersonal = marks.some((m) => m.kind === "status" && m.attendance);
        const dayWide = !hasPersonal ? marks.find((m) => m.kind !== "blank") : undefined;
        let dayStatus: { status: DailyRecord["status"]; note: string } | null = null;
        if (dayWide) {
          if (dayWide.kind === "status") dayStatus = { status: dayWide.status, note: dayWide.note ?? labelForStatus(dayWide.status) };
          else if (dayWide.kind === "unknown") {
            dayStatus = { status: "holiday", note: dayWide.text };
            issues.push({ row: rowNo, level: "warning", message: `${block.sheet} ${date}: "${dayWide.text}" treated as a holiday for everyone` });
          }
        }

        marks.forEach((m, i) => {
          const col = cols[i];
          let status: DailyRecord["status"];
          let note: string | null;
          if (dayStatus) {
            if (!col.emp || !inSpan(col.emp.id, date) || !withinEmployment(col.emp, date)) return;
            ({ status, note } = dayStatus);
          } else if (m.kind === "status") {
            ({ status, note } = m);
          } else if (m.kind === "unknown") {
            issues.push({ row: rowNo, level: "warning", message: `${block.sheet} ${date}, ${col.name.trim()}: unrecognised mark "${m.text}" — skipped` });
            return;
          } else {
            return;
          }
          if (!col.emp) {
            if (m.kind === "status" && m.attendance) {
              if (col.error === "ambiguous") ambiguous.add(col.name.trim());
              else unmatched.set(col.name.trim(), (unmatched.get(col.name.trim()) ?? 0) + 1);
            }
            return;
          }
          if (!withinEmployment(col.emp, date) && m.kind === "status" && m.attendance) {
            issues.push({ row: rowNo, level: "warning", message: `${col.emp.name} is marked on ${date}, outside their joining/exit dates` });
          }
          const k = `${col.emp.id}|${date}`;
          if (daily.has(k)) {
            inFileDuplicates++;
            return;
          }
          if (!start || date < start) start = date;
          if (!end || date > end) end = date;
          daily.set(k, {
            employeeId: col.emp.id,
            workDate: date,
            firstIn: null,
            lastOut: null,
            workedMinutes: null,
            punchCount: 0,
            status,
            isLate: false,
            notes: note,
          });
        });
      }
    }
  }

  for (const [k, notes] of overtime) {
    const rec = daily.get(k);
    if (!rec) continue;
    const ot = `OT: ${[...new Set(notes)].join("; ")}`;
    rec.notes = rec.notes ? `${rec.notes} · ${ot}` : ot;
  }
  for (const name of ambiguous) issues.push({ row: 0, level: "error", message: `"${name}" matches more than one employee — set a unique biometric device user ID for each` });
  for (const [header, emp] of firstNameMatches) issues.push({ row: 0, level: "warning", message: `"${header}" matched to ${emp} by first name — set their device user ID to "${header}" to make this explicit` });
  if (inFileDuplicates) issues.push({ row: 0, level: "warning", message: `${inFileDuplicates} employee-days appear in more than one block or sheet — the first one is kept` });
  if (!allBlocks.some((b) => !b.overtime)) issues.push({ row: 0, level: "error", message: 'No attendance register found — expected a header row starting with "DATE" followed by employee names' });

  return {
    punches: [],
    daily: [...daily.values()],
    issues,
    unmatched,
    ambiguous,
    totalRows,
    skippedRows,
    inFileDuplicates,
    period: { start, end },
    blocks: allBlocks,
  };
}

function labelForStatus(s: DailyRecord["status"]) {
  return s === "weekly_off" ? "Weekly off" : s === "holiday" ? "Holiday" : s;
}
