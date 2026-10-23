"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, toast } from "./client";
import { FieldInput, type Field, type Values } from "./forms";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const NUMERIC: Field["type"][] = ["number", "money", "percent"];

/**
 * Edits one settings key (company, payroll, attendance…) and PUTs the whole object as
 * { key, value } to /api/portal/settings. The server validates and applies defaults.
 */
export function SettingsForm({
  settingKey,
  fields,
  initial,
  weekdays,
  submitLabel = "Save settings",
}: {
  settingKey: string;
  fields: Field[];
  initial: Record<string, unknown>;
  /** Optional number[] field (0 = Sunday … 6 = Saturday) edited as day checkboxes. */
  weekdays?: { name: string; label: string; help?: string };
  submitLabel?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) {
      const raw = initial[f.name];
      v[f.name] = f.type === "checkbox" ? Boolean(raw) : raw === null || raw === undefined ? "" : String(raw);
    }
    return v;
  });
  const [days, setDays] = useState<number[]>(() => {
    const raw = weekdays ? initial[weekdays.name] : undefined;
    return Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isInteger(n)) : [];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function set(name: string, value: string | boolean) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  }

  function toggleDay(d: number, on: boolean) {
    setDays((cur) => (on ? Array.from(new Set([...cur, d])).sort((a, b) => a - b) : cur.filter((x) => x !== d)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const value: Record<string, unknown> = {};
    const local: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "checkbox") value[f.name] = Boolean(v);
      else if (NUMERIC.includes(f.type)) {
        const s = String(v ?? "").replace(/,/g, "").trim();
        const n = Number(s);
        if (s === "" || !Number.isFinite(n)) local[f.name] = "Enter a number";
        else value[f.name] = n;
      } else value[f.name] = String(v ?? "");
    }
    if (weekdays) value[weekdays.name] = days;
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    try {
      await api("/api/portal/settings", { method: "PUT", body: { key: settingKey, value } });
      toast("Settings saved");
      setErrors({});
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped: Record<string, string> = {};
        for (const [k, msg] of Object.entries(err.fields ?? {})) {
          const name = k.startsWith("value.") ? k.slice(6).split(".")[0] : k;
          mapped[name] = msg;
        }
        setErrors(mapped);
        setFormError(err.message);
      } else {
        setFormError("Could not save. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {formError ? (
        <div className="pt-alert error" role="alert" style={{ marginBottom: "1rem" }}>
          {formError}
        </div>
      ) : null}
      <div className="pt-form">
        {fields.filter((f) => !f.showIf || f.showIf.in.includes(String(values[f.showIf.field] ?? ""))).map((f) => (
          <FieldInput key={f.name} field={{ ...f, name: `${settingKey}-${f.name}` }} value={values[f.name]} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
        {weekdays ? (
          <fieldset className="pt-field span-2" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="pt-label">{weekdays.label}</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem" }}>
              {DAYS.map((label, d) => (
                <label key={d} className="pt-check">
                  <input type="checkbox" checked={days.includes(d)} onChange={(e) => toggleDay(d, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            {errors[weekdays.name] ? <span className="pt-error-text">{errors[weekdays.name]}</span> : weekdays.help ? <span className="pt-help">{weekdays.help}</span> : null}
          </fieldset>
        ) : null}
      </div>
      <div className="pt-actions" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
        <button type="submit" className="pt-btn pt-btn-primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
