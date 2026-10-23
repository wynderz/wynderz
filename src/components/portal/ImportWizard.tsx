"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, toast } from "./client";
import { fmtDate, fmtTime, fmtHours, labelize } from "./format";
import { Icon } from "./icons";

type SheetInfo = {
  name: string;
  rowCount: number;
  headerRow: number;
  headers: string[];
  sample: string[][];
  suggested: Record<string, unknown> & { layout: "punches" | "daily"; employeeMatch: string };
};
type Saved = { id: number; name: string; config: Record<string, unknown> };
type Started = { jobId: number; fileName: string; previousImport: { id: number; createdAt: string } | null; sheets: SheetInfo[]; savedMappings: Saved[] };

type Kind = "attendance" | "timesheet";

type ColumnSpec = { key: string; label: string; required?: boolean; showFor?: Array<"punches" | "daily"> };

const ATTENDANCE_COLUMNS: ColumnSpec[] = [
  { key: "employee", label: "Employee identifier", required: true },
  { key: "dateTime", label: "Punch date-time (combined)", showFor: ["punches"] },
  { key: "date", label: "Date" },
  { key: "time", label: "Punch time (if separate)", showFor: ["punches"] },
  { key: "inTime", label: "In time", showFor: ["daily"] },
  { key: "outTime", label: "Out time", showFor: ["daily"] },
  { key: "status", label: "Status (P/A/L…)", showFor: ["daily"] },
  { key: "deviceId", label: "Device ID" },
];

const TIMESHEET_COLUMNS: ColumnSpec[] = [
  { key: "employee", label: "Employee identifier", required: true },
  { key: "date", label: "Work date", required: true },
  { key: "project", label: "Project code or name" },
  { key: "task", label: "Task description" },
  { key: "start", label: "Start time" },
  { key: "end", label: "End time" },
  { key: "break", label: "Break (minutes)" },
  { key: "hours", label: "Total hours" },
];

type Mapping = {
  sheet: string;
  headerRow: number;
  layout: "punches" | "daily";
  employeeMatch: "device_user_id" | "employee_code" | "name";
  dateOrder: "auto" | "DMY" | "MDY" | "YMD";
  columns: Record<string, number | null>;
};

function fromSheet(s: SheetInfo, kind: Kind): Mapping {
  const sug = s.suggested as Record<string, number | null | string>;
  const cols: Record<string, number | null> = {};
  for (const c of kind === "attendance" ? ATTENDANCE_COLUMNS : TIMESHEET_COLUMNS) {
    const v = sug[c.key];
    cols[c.key] = typeof v === "number" ? v : null;
  }
  if (kind === "timesheet") {
    const find = (re: RegExp) => {
      const i = s.headers.findIndex((h) => re.test(h));
      return i >= 0 ? i : null;
    };
    cols.project = find(/project|job/i);
    cols.task = find(/task|work|description|activity/i);
    cols.start = find(/^(start|from|in)/i);
    cols.end = find(/^(end|to|out)/i);
    cols.break = find(/break|lunch/i);
    cols.hours = find(/hours|duration|total/i);
    cols.date = cols.date ?? find(/date|day/i);
  }
  return {
    sheet: s.name,
    headerRow: s.headerRow,
    layout: (sug.layout as Mapping["layout"]) ?? "punches",
    employeeMatch: (sug.employeeMatch as Mapping["employeeMatch"]) ?? "device_user_id",
    dateOrder: "auto",
    columns: cols,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ImportWizard({ kind }: { kind: Kind }) {
  const base = kind === "attendance" ? "/api/portal/attendance/import" : "/api/portal/timesheets/import";
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [markAbsent, setMarkAbsent] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [reason, setReason] = useState("");

  const sheet = started?.sheets.find((s) => s.name === mapping?.sheet);
  const headers = useMemo(() => {
    if (!sheet || !mapping) return [];
    const row = sheet.sample[mapping.headerRow - 1];
    if (!row || mapping.headerRow === sheet.headerRow) return sheet.headers;
    const width = Math.max(row.length, ...sheet.sample.slice(mapping.headerRow).map((r) => r.length));
    return Array.from({ length: width }, (_, i) => row[i] || `Column ${i + 1}`);
  }, [sheet, mapping]);

  const columns = (kind === "attendance" ? ATTENDANCE_COLUMNS : TIMESHEET_COLUMNS).filter((c) => !c.showFor || (mapping && c.showFor.includes(mapping.layout)));

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return setError("Choose a file first.");
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await api<Started>(base, { form });
      setStarted(res);
      const first = res.sheets.find((s) => s.rowCount > 1) ?? res.sheets[0];
      setMapping(fromSheet(first, kind));
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function payload(m: Mapping) {
    const cols: Record<string, number | null> = {};
    for (const c of columns) cols[c.key] = m.columns[c.key] ?? null;
    if (kind === "timesheet") return { sheet: m.sheet, headerRow: m.headerRow, employeeMatch: m.employeeMatch, dateOrder: m.dateOrder, columns: cols };
    return { ...m, columns: cols };
  }

  async function runPreview() {
    if (!started || !mapping) return;
    setBusy(true);
    setError("");
    try {
      const res = await api(`${base}/${started.jobId}/preview`, { body: payload(mapping) });
      setPreview(res);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!started || !mapping) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { mapping: payload(mapping), saveMappingName: saveName || null, correctionReason: reason || null };
      if (kind === "attendance") body.markAbsent = markAbsent;
      const res = await api(`${base}/${started.jobId}/commit`, { body });
      setResult(res);
      setStep(4);
      toast("Import complete");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function applySaved(id: string) {
    const s = started?.savedMappings.find((m) => String(m.id) === id);
    if (!s || !started) return;
    const cfg = s.config as unknown as Mapping;
    if (!started.sheets.some((x) => x.name === cfg.sheet)) {
      toast(`Saved mapping uses sheet "${cfg.sheet}", which is not in this file. Pick the sheet manually.`, "error");
      setMapping((m) => (m ? { ...cfg, sheet: m.sheet, layout: cfg.layout ?? "punches" } : m));
      return;
    }
    setMapping({ ...cfg, layout: cfg.layout ?? "punches", dateOrder: cfg.dateOrder ?? "auto" });
  }

  const steps = ["Upload", "Map columns", "Validate", "Done"];

  return (
    <div>
      <div className="pt-steps" aria-label="Import steps">
        {steps.map((s, i) => (
          <span key={s} className={`pt-step${step === i + 1 ? " active" : step > i + 1 ? " done" : ""}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      {error ? (
        <div className="pt-alert error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="pt-card">
          <form onSubmit={upload} className="pt-grid" style={{ gap: "1rem", maxWidth: "36rem" }}>
            <div className="pt-field">
              <label htmlFor="file">{kind === "attendance" ? "Fingerprint device export" : "Timesheet file"} (.xlsx or .csv)</label>
              <input id="file" name="file" type="file" accept=".xlsx,.csv,.txt,.tsv" className="pt-input" required />
              <span className="pt-help">
                The file is stored privately with this import for reference. Nothing is saved to {kind === "attendance" ? "attendance" : "timesheets"} until you confirm. Legacy .xls files must be re-saved as .xlsx or .csv.
              </span>
            </div>
            <div>
              <button type="submit" className="pt-btn pt-btn-primary" disabled={busy}>
                <Icon name="upload" /> {busy ? "Reading file…" : "Upload and detect columns"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {step === 2 && started && mapping && sheet ? (
        <div className="pt-grid" style={{ gap: "1rem" }}>
          {started.previousImport ? (
            <div className="pt-alert warn">This exact file was already imported on {new Date(started.previousImport.createdAt).toLocaleString("en-IN")}. Importing again is safe — existing records will not be duplicated.</div>
          ) : null}
          <div className="pt-card">
            <div className="pt-form">
              <div className="pt-field">
                <label htmlFor="sheet">Worksheet</label>
                <select id="sheet" className="pt-select" value={mapping.sheet} onChange={(e) => setMapping(fromSheet(started.sheets.find((s) => s.name === e.target.value)!, kind))}>
                  {started.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.rowCount} rows)
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-field">
                <label htmlFor="headerRow">Header row number</label>
                <input id="headerRow" type="number" min={1} max={sheet.sample.length} className="pt-input" value={mapping.headerRow} onChange={(e) => setMapping({ ...mapping, headerRow: Math.max(1, Math.min(sheet.sample.length, Number(e.target.value) || 1)) })} />
              </div>
              {started.savedMappings.length ? (
                <div className="pt-field">
                  <label htmlFor="saved">Use a saved mapping</label>
                  <select id="saved" className="pt-select" defaultValue="" onChange={(e) => applySaved(e.target.value)}>
                    <option value="">—</option>
                    {started.savedMappings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {kind === "attendance" ? (
                <div className="pt-field">
                  <label htmlFor="layout">File layout</label>
                  <select id="layout" className="pt-select" value={mapping.layout} onChange={(e) => setMapping({ ...mapping, layout: e.target.value as Mapping["layout"] })}>
                    <option value="punches">One row per punch (log)</option>
                    <option value="daily">One row per employee per day (in/out)</option>
                  </select>
                </div>
              ) : null}
              <div className="pt-field">
                <label htmlFor="match">Match employees by</label>
                <select id="match" className="pt-select" value={mapping.employeeMatch} onChange={(e) => setMapping({ ...mapping, employeeMatch: e.target.value as Mapping["employeeMatch"] })}>
                  <option value="device_user_id">Biometric device user ID</option>
                  <option value="employee_code">Employee ID (EMP-001…)</option>
                  <option value="name">Employee name (exact)</option>
                </select>
              </div>
              <div className="pt-field">
                <label htmlFor="dateOrder">Date format</label>
                <select id="dateOrder" className="pt-select" value={mapping.dateOrder} onChange={(e) => setMapping({ ...mapping, dateOrder: e.target.value as Mapping["dateOrder"] })}>
                  <option value="auto">Auto (day-first, e.g. 05/04/2026 = 5 Apr)</option>
                  <option value="DMY">Day / Month / Year</option>
                  <option value="MDY">Month / Day / Year</option>
                  <option value="YMD">Year-Month-Day</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-card">
            <h3 className="pt-card-title" style={{ marginBottom: "0.75rem" }}>
              Map device columns to portal fields
            </h3>
            <div className="pt-form">
              {columns.map((c) => (
                <div key={c.key} className="pt-field">
                  <label htmlFor={`col-${c.key}`}>
                    {c.label}
                    {c.required ? <span className="req"> *</span> : null}
                  </label>
                  <select
                    id={`col-${c.key}`}
                    className="pt-select"
                    value={mapping.columns[c.key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, columns: { ...mapping.columns, [c.key]: e.target.value === "" ? null : Number(e.target.value) } })}
                  >
                    <option value="">— Not in file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {String.fromCharCode(65 + (i % 26))}
                        {i >= 26 ? Math.floor(i / 26) : ""}: {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-card pt-flush">
            <div className="pt-card-head" style={{ padding: "0.9rem 1rem 0" }}>
              <h3 className="pt-card-title">File preview</h3>
              <span className="pt-card-sub">Highlighted row = header</span>
            </div>
            <div className="pt-table-wrap" style={{ maxHeight: 320 }}>
              <table className="pt-table">
                <tbody>
                  {sheet.sample.map((r, i) => (
                    <tr key={i} style={i + 1 === mapping.headerRow ? { background: "var(--pt-lime-soft)", fontWeight: 700 } : i + 1 < mapping.headerRow ? { opacity: 0.45 } : undefined}>
                      <td className="muted">{i + 1}</td>
                      {r.map((c, j) => (
                        <td key={j} className="nowrap">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-actions">
            <button type="button" className="pt-btn pt-btn-ghost" onClick={() => setStep(1)}>
              ← Upload a different file
            </button>
            <button type="button" className="pt-btn pt-btn-primary" onClick={runPreview} disabled={busy}>
              {busy ? "Validating…" : "Validate rows →"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && preview ? (
        <div className="pt-grid" style={{ gap: "1rem" }}>
          <div className="pt-kpis">
            {kind === "attendance" ? (
              <>
                <Stat label="Rows in file" value={preview.totalRows} />
                <Stat label="Valid punches / rows" value={preview.validPunches || preview.dailyRecords} />
                <Stat label="Employee-days" value={preview.dailyRecords} />
                <Stat label="Already imported" value={preview.alreadyImported} hint="Will be skipped" />
                <Stat label="Duplicates in file" value={preview.inFileDuplicates} />
                <Stat label="Manual records kept" value={preview.manualKept} hint="Never overwritten" />
                <Stat label="Errors" value={preview.errors} tone={preview.errors ? "danger" : undefined} />
                <Stat label="Unmatched employees" value={preview.unmatched.length} tone={preview.unmatched.length ? "warn" : undefined} />
              </>
            ) : (
              <>
                <Stat label="Valid rows" value={preview.validRows} />
                <Stat label="Errors" value={preview.errors} tone={preview.errors ? "danger" : undefined} />
                <Stat label="Warnings" value={preview.warnings} />
                <Stat label="Unmatched employees" value={preview.unmatched.length} tone={preview.unmatched.length ? "warn" : undefined} />
              </>
            )}
          </div>

          {kind === "attendance" && preview.period?.start ? (
            <div className="pt-alert info">
              Period in file: {fmtDate(preview.period.start)} – {fmtDate(preview.period.end)}.{" "}
              {Object.entries(preview.statusCounts as Record<string, number>)
                .map(([k, v]) => `${v} ${labelize(k)}`)
                .join(" · ")}
            </div>
          ) : null}

          {preview.unmatched.length ? (
            <div className="pt-card">
              <h3 className="pt-card-title">Unmatched employee identifiers</h3>
              <p className="pt-help">
                These rows will be skipped — employees are never created automatically. Add the identifier to the right employee&apos;s{" "}
                {mapping?.employeeMatch === "device_user_id" ? "“Biometric device user ID”" : mapping?.employeeMatch === "employee_code" ? "Employee ID" : "name"} on the{" "}
                <Link className="pt-link" href="/portal/employees" target="_blank">
                  Employees page
                </Link>
                , then validate again.
              </p>
              <div className="pt-actions" style={{ marginTop: "0.5rem" }}>
                {preview.unmatched.slice(0, 50).map((u: { key: string; rows: number }) => (
                  <span key={u.key} className="pt-badge warn">
                    {u.key} · {u.rows} rows
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {kind === "attendance" && preview.closedYears?.length ? (
            <div className="pt-alert warn">
              This file includes dates in {preview.closedYears.map((y: { label: string; status: string }) => `${y.label} (${y.status})`).join(", ")}. Archived years cannot be changed; closed years need a correction reason below.
            </div>
          ) : null}

          {preview.issues.length ? (
            <div className="pt-card pt-flush">
              <div className="pt-card-head" style={{ padding: "0.9rem 1rem 0" }}>
                <h3 className="pt-card-title">Errors and warnings</h3>
                <span className="pt-card-sub">Rows with errors are skipped</span>
              </div>
              <div className="pt-table-wrap" style={{ maxHeight: 260 }}>
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Level</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((i: { row: number; level: string; message: string }, k: number) => (
                      <tr key={k}>
                        <td>{i.row}</td>
                        <td>
                          <span className={`pt-badge ${i.level === "error" ? "danger" : "warn"}`}>{i.level}</span>
                        </td>
                        <td>{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="pt-card pt-flush">
            <div className="pt-card-head" style={{ padding: "0.9rem 1rem 0" }}>
              <h3 className="pt-card-title">Preview of records to save</h3>
            </div>
            <div className="pt-table-wrap" style={{ maxHeight: 320 }}>
              {kind === "attendance" ? (
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee</th>
                      <th>In</th>
                      <th>Out</th>
                      <th className="num">Hours</th>
                      <th>Status</th>
                      <th>Late</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((d: any, i: number) => (
                      <tr key={i}>
                        <td className="nowrap">{fmtDate(d.workDate)}</td>
                        <td>{d.employeeName}</td>
                        <td>{fmtTime(d.firstIn)}</td>
                        <td>{fmtTime(d.lastOut)}</td>
                        <td className="num">{d.workedMinutes === null ? "—" : fmtHours(d.workedMinutes)}</td>
                        <td>
                          <span className="pt-badge">{labelize(d.status)}</span>
                        </td>
                        <td>{d.isLate ? <span className="pt-badge warn">late</span> : ""}</td>
                        <td className="muted">{d.notes ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Date</th>
                      <th>Task</th>
                      <th>Start</th>
                      <th>End</th>
                      <th className="num">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((d: any, i: number) => (
                      <tr key={i}>
                        <td className="muted">{d.row}</td>
                        <td className="nowrap">{fmtDate(d.workDate)}</td>
                        <td>{d.task}</td>
                        <td>{d.startTime ?? "—"}</td>
                        <td>{d.endTime ?? "—"}</td>
                        <td className="num">{d.hours ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="pt-card">
            <div className="pt-form">
              {kind === "attendance" ? (
                <div className="pt-field span-2">
                  <label className="pt-check">
                    <input type="checkbox" checked={markAbsent} onChange={(e) => setMarkAbsent(e.target.checked)} />
                    Mark active employees with no punches as absent on working days in this period (weekly off days from Settings are skipped)
                  </label>
                </div>
              ) : null}
              <div className="pt-field">
                <label htmlFor="saveName">Save this column mapping as (optional)</label>
                <input id="saveName" className="pt-input" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. ZKTeco monthly export" />
              </div>
              <div className="pt-field">
                <label htmlFor="reason">Correction reason (only for closed years)</label>
                <input id="reason" className="pt-input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="pt-actions">
            <button type="button" className="pt-btn pt-btn-ghost" onClick={() => setStep(2)}>
              ← Adjust mapping
            </button>
            <button type="button" className="pt-btn pt-btn-primary" onClick={commit} disabled={busy || (kind === "attendance" ? !preview.dailyRecords : !preview.validRows)}>
              {busy ? "Importing…" : "Confirm import"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 && result ? (
        <div className="pt-card">
          <h3 className="pt-card-title">Import complete</h3>
          <div className="pt-kpis" style={{ margin: "1rem 0" }}>
            {kind === "attendance" ? (
              <>
                <Stat label="New days" value={result.inserted} />
                <Stat label="Updated days" value={result.updated} />
                <Stat label="New punches" value={result.newPunches} />
                <Stat label="Manual records kept" value={result.keptManual} />
                <Stat label="Error rows" value={result.errorRows} />
                <Stat label="Unmatched rows" value={result.unmatchedRows} />
              </>
            ) : (
              <>
                <Stat label="Added" value={result.inserted} />
                <Stat label="Duplicates skipped" value={result.duplicates} />
                <Stat label="Error rows" value={result.errorRows} />
              </>
            )}
          </div>
          <div className="pt-actions">
            <Link className="pt-btn pt-btn-primary" href={kind === "attendance" ? "/portal/attendance" : "/portal/timesheets"}>
              View {kind === "attendance" ? "attendance" : "timesheets"}
            </Link>
            <button
              type="button"
              className="pt-btn pt-btn-secondary"
              onClick={() => {
                setStep(1);
                setStarted(null);
                setPreview(null);
                setResult(null);
              }}
            >
              Import another file
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "danger" | "warn" }) {
  return (
    <div className={`pt-kpi${tone ? ` tone-${tone}` : ""}`}>
      <div className="pt-kpi-label">{label}</div>
      <div className="pt-kpi-value">{Number(value ?? 0).toLocaleString("en-IN")}</div>
      {hint ? <div className="pt-kpi-hint">{hint}</div> : null}
    </div>
  );
}
