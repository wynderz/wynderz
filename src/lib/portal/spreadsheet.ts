import ExcelJS from "exceljs";
import Papa from "papaparse";
import { AppError } from "./errors";

/** A cell normalized to a primitive. Dates keep their wall-clock value (read as UTC fields). */
export type Cell = string | number | boolean | Date | null;
export type Sheet = { name: string; rows: Cell[][] };

const MAX_ROWS = 100_000;

export function detectKind(fileName: string, bytes: Uint8Array): "xlsx" | "csv" | "xls" | "unknown" {
  const lower = fileName.toLowerCase();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (isZip && (lower.endsWith(".xlsx") || lower.endsWith(".xlsm"))) return "xlsx";
  if (isOle || lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) return "csv";
  return "unknown";
}

/** Reads an uploaded workbook/CSV into plain grids. */
export async function readSpreadsheet(fileName: string, bytes: Uint8Array): Promise<Sheet[]> {
  const kind = detectKind(fileName, bytes);
  if (kind === "xls") {
    throw new AppError("Legacy .xls files are not supported. Open the export in Excel and save it as .xlsx or .csv, then upload again.");
  }
  if (kind === "csv") return [readCsv(fileName, bytes)];
  if (kind === "xlsx") return readXlsx(bytes);
  throw new AppError("Upload an .xlsx or .csv file.");
}

function readCsv(fileName: string, bytes: Uint8Array): Sheet {
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter: fileName.toLowerCase().endsWith(".tsv") ? "\t" : "" });
  if (parsed.data.length > MAX_ROWS) throw new AppError(`File has more than ${MAX_ROWS.toLocaleString()} rows.`);
  return { name: "CSV", rows: parsed.data.map((r) => r.map((c) => (c === "" ? null : c))) };
}

async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Could not read this Excel file. Check that it is a valid .xlsx.");
  }
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.rowCount > MAX_ROWS) throw new AppError(`Sheet "${ws.name}" has more than ${MAX_ROWS.toLocaleString()} rows.`);
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) values.push(normalizeCell(row.getCell(c).value));
      rows[rowNumber - 1] = values;
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

function normalizeCell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("result" in v) return normalizeCell((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ("error" in v) return null;
  }
  return String(v);
}

/** Builds headers from a 1-based header row; blank headers become "Column N". */
export function headersOf(sheet: Sheet, headerRow: number) {
  const row = sheet.rows[headerRow - 1] ?? [];
  const width = Math.max(row.length, ...sheet.rows.slice(headerRow, headerRow + 20).map((r) => r?.length ?? 0));
  return Array.from({ length: width }, (_, i) => {
    const v = row[i];
    return v === null || v === undefined || v === "" ? `Column ${i + 1}` : cellToString(v);
  });
}

/** Guesses the header row: the first row within the top 15 with at least 2 text cells. */
export function guessHeaderRow(sheet: Sheet) {
  for (let i = 0; i < Math.min(15, sheet.rows.length); i++) {
    const texts = (sheet.rows[i] ?? []).filter((c) => typeof c === "string" && /[a-z]/i.test(c)).length;
    if (texts >= 2) return i + 1;
  }
  return 1;
}

export function cellToString(v: Cell): string {
  if (v === null) return "";
  if (v instanceof Date) {
    const iso = v.toISOString();
    return v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds() ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
  }
  return String(v).trim();
}

/* ------------------------------------------------------------------ cell parsing */

export type DateOrder = "auto" | "DMY" | "MDY" | "YMD";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function excelSerialToParts(n: number) {
  // Excel epoch 1899-12-30 (accounts for the 1900 leap-year bug).
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), seconds: d.getUTCSeconds() };
}

const p2 = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last ? `${y}-${p2(m)}-${p2(d)}` : null;
}

/** Parses a date cell. Returns ISO date or null. Indian exports default to day-first. */
export function parseDateCell(v: Cell, order: DateOrder = "auto"): string | null {
  if (v === null || v === "") return null;
  if (v instanceof Date) return validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const p = excelSerialToParts(v);
      return validYmd(p.y, p.m, p.d);
    }
    return null;
  }
  const s = String(v).trim().split(/[ T]/)[0];
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (order === "MDY") return validYmd(y, a, b);
    if (order === "DMY" || order === "auto") return validYmd(y, b, a) ?? (order === "auto" ? validYmd(y, a, b) : null);
    return null;
  }
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,4})[a-z]*[-\s,]+(\d{2,4})$/.exec(String(v).trim());
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, MONTHS[m[2].toLowerCase()], Number(m[1]));
  }
  return null;
}

/** Parses a time cell ("09:05", "9:05 AM", Excel fraction, Date). Returns minutes since midnight. */
export function parseTimeCell(v: Cell): number | null {
  if (v === null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") {
    const frac = v % 1;
    if (v >= 0 && (v < 1 || v > 20000)) return Math.round(frac * 1440) % 1440;
    return null;
  }
  const s = String(v).trim();
  const tail = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(s);
  if (!tail) return null;
  let h = Number(tail[1]);
  const min = Number(tail[2]);
  const ampm = tail[4]?.toLowerCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Parses a combined date-time cell (punch log). */
export function parseDateTimeCell(v: Cell, order: DateOrder = "auto"): { date: string; minutes: number } | null {
  if (v === null || v === "") return null;
  if (v instanceof Date) {
    const date = parseDateCell(v);
    return date ? { date, minutes: v.getUTCHours() * 60 + v.getUTCMinutes() } : null;
  }
  if (typeof v === "number") {
    if (v < 20000) return null;
    const p = excelSerialToParts(v);
    const date = validYmd(p.y, p.m, p.d);
    return date ? { date, minutes: p.minutes } : null;
  }
  const s = String(v).trim();
  const date = parseDateCell(s, order);
  const minutes = parseTimeCell(s.slice(s.search(/[ T]/) + 1));
  if (!date || minutes === null || !/[ T]/.test(s)) return null;
  return { date, minutes };
}

/* ------------------------------------------------------------------ export */

export type ExportColumn<T> = { header: string; value: (row: T) => unknown; type?: "money" | "date" | "number" | "text"; width?: number };

/** Builds an .xlsx with typed columns (money as numbers with 2-dp format, dates as dates). */
export async function buildXlsx<T>(sheetName: string, columns: ExportColumn<T>[], rows: T[], title?: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wynderz Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  let start = 1;
  if (title) {
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    start = 3;
  }
  const header = ws.getRow(start);
  columns.forEach((c, i) => {
    header.getCell(i + 1).value = c.header;
    ws.getColumn(i + 1).width = c.width ?? Math.min(40, Math.max(12, c.header.length + 4));
  });
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF101827" } };
  rows.forEach((r, ri) => {
    const row = ws.getRow(start + 1 + ri);
    columns.forEach((c, ci) => {
      const raw = c.value(r);
      const cell = row.getCell(ci + 1);
      if (raw === null || raw === undefined || raw === "") return;
      if (c.type === "money" || c.type === "number") {
        cell.value = Number(raw);
        if (c.type === "money") cell.numFmt = "#,##0.00";
      } else if (c.type === "date" && typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const [y, m, d] = raw.slice(0, 10).split("-").map(Number);
        cell.value = new Date(Date.UTC(y, m - 1, d));
        cell.numFmt = "dd-mmm-yyyy";
      } else {
        cell.value = String(raw);
      }
    });
  });
  ws.views = [{ state: "frozen", ySplit: start }];
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv<T>(columns: ExportColumn<T>[], rows: T[]) {
  const lines = [columns.map((c) => csvEscape(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvEscape(c.value(r))).join(","));
  return "﻿" + lines.join("\r\n");
}

export function fileResponse(body: Buffer | string, fileName: string, type: "xlsx" | "csv") {
  const safe = fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
