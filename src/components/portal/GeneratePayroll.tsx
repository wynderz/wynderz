"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, toast } from "./client";
import { Drawer } from "./forms";
import { Icon } from "./icons";

type Result = { created: number; existing: number; skipped: Array<{ employee: string; reason: string }> };

/** Creates missing payroll records for every active employee for one month. Never overwrites. */
export function GeneratePayroll({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [useAttendance, setUseAttendance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  function close() {
    setOpen(false);
    setResult(null);
    setError("");
    setNeedsReason(false);
    setReason("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!month) return setError("Choose a month.");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api<Result>("/api/portal/payroll/generate", {
        body: { periodMonth: month, useAttendance, ...(needsReason ? { correctionReason: reason } : {}) },
      });
      setResult(r);
      toast(`${r.created} created, ${r.existing} existed, ${r.skipped.length} skipped`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "year_locked" && !err.message.includes("archived")) setNeedsReason(true);
        setError(err.message);
      } else {
        setError("Could not generate payroll. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="pt-btn pt-btn-secondary" onClick={() => setOpen(true)}>
        <Icon name="calendar" /> Generate month
      </button>
      {open ? (
        <Drawer title="Generate payroll for a month" onClose={close}>
          <form onSubmit={submit} noValidate>
            <p className="pt-help" style={{ marginTop: 0 }}>
              Creates a payroll record for every active employee who does not have one for this month. Existing records are never changed.
            </p>
            {error ? (
              <div className="pt-alert error" role="alert" style={{ marginBottom: "1rem" }}>
                {error}
              </div>
            ) : null}
            <div className="pt-form">
              <div className="pt-field">
                <label htmlFor="gen-month">
                  Pay month <span className="req">*</span>
                </label>
                <input id="gen-month" className="pt-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
              </div>
              <div className="pt-field span-2">
                <label className="pt-check" htmlFor="gen-att">
                  <input id="gen-att" type="checkbox" checked={useAttendance} onChange={(e) => setUseAttendance(e.target.checked)} />
                  Use attendance for days paid
                </label>
                <span className="pt-help">Present = 1 day, half day = 0.5. Daily-paid employees with no attendance are skipped.</span>
              </div>
              {needsReason ? (
                <div className="pt-field span-2">
                  <label htmlFor="gen-reason">
                    Correction reason <span className="req">*</span>
                  </label>
                  <input id="gen-reason" className="pt-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does a closed year need this change?" />
                  <span className="pt-help">The financial year is closed. Your reason is recorded in the audit log.</span>
                </div>
              ) : null}
            </div>
            <div className="pt-actions" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button type="submit" className="pt-btn pt-btn-primary" disabled={busy || (needsReason && !reason.trim())}>
                {busy ? "Generating…" : "Generate"}
              </button>
            </div>
          </form>
          {result ? (
            <div style={{ marginTop: "1.25rem" }} aria-live="polite">
              <div className="pt-alert success">
                <strong>{result.created}</strong> created, <strong>{result.existing}</strong> already existed, <strong>{result.skipped.length}</strong> skipped.
              </div>
              {result.skipped.length ? (
                <div className="pt-table-wrap" style={{ marginTop: "0.75rem" }}>
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Skipped employee</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.skipped.map((s, i) => (
                        <tr key={i}>
                          <td>{s.employee}</td>
                          <td className="wrap">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </Drawer>
      ) : null}
    </>
  );
}
