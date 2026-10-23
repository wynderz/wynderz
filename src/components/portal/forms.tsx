"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, toast } from "./client";
import { formatINR } from "./format";
import { Icon, type IconName } from "./icons";

export type FieldOption = { value: string; label: string };

/** Serializable field definition — server pages pass these to client forms. */
export type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "money" | "percent" | "date" | "month" | "time" | "select" | "checkbox" | "email" | "password";
  required?: boolean;
  options?: FieldOption[];
  emptyLabel?: string;
  placeholder?: string;
  help?: string;
  span?: 2;
  step?: string;
  min?: string;
  max?: string;
  /** Show only when another field has one of these values. */
  showIf?: { field: string; in: string[] };
  readOnly?: boolean;
};

export type Values = Record<string, string | boolean>;

/** Live totals shown while typing. Display only — the server recalculates everything. */
export type Preview = "tax" | "material" | "payroll" | "invoice" | "timesheet" | null;

function toValues(fields: Field[], initial?: Record<string, unknown>): Values {
  const v: Values = {};
  for (const f of fields) {
    const raw = initial?.[f.name];
    if (f.type === "checkbox") v[f.name] = raw === undefined ? false : Boolean(raw);
    else if (raw === null || raw === undefined) v[f.name] = "";
    else if (f.type === "month" && typeof raw === "string") v[f.name] = raw.slice(0, 7);
    else if (f.type === "time" && typeof raw === "string") v[f.name] = raw.slice(0, 5);
    else if (f.type === "date" && typeof raw === "string") v[f.name] = raw.slice(0, 10);
    else v[f.name] = String(raw);
  }
  return v;
}

function n(v: string | boolean | undefined) {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function PreviewBox({ kind, v }: { kind: Preview; v: Values }) {
  if (!kind) return null;
  if (kind === "tax" || kind === "material" || kind === "invoice") {
    const base = kind === "material" ? n(v.quantity) * n(v.unitCost) : v.baseAmount ? n(v.baseAmount) : n(v.quantity) * n(v.unitPrice);
    const gst = Math.round(base * n(v.gstRate)) / 100;
    return (
      <div className="pt-computed span-2" aria-live="polite">
        <span>
          Base <strong>{formatINR(base)}</strong>
        </span>
        <span>
          GST <strong>{formatINR(gst)}</strong>
        </span>
        <span>
          Total <strong>{formatINR(base + gst)}</strong>
        </span>
        <span className="pt-help">Final amounts are calculated by the server.</span>
      </div>
    );
  }
  if (kind === "timesheet") {
    const [sh, sm] = String(v.startTime || "").split(":").map(Number);
    const [eh, em] = String(v.endTime || "").split(":").map(Number);
    if (Number.isNaN(sh) || Number.isNaN(eh) || !v.startTime || !v.endTime) return null;
    const mins = eh * 60 + em - (sh * 60 + sm) - n(v.breakMinutes);
    return (
      <div className="pt-computed span-2">
        Worked <strong>{mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : "invalid range"}</strong>
      </div>
    );
  }
  return null;
}

export function EntityForm({
  fields,
  endpoint,
  method = "POST",
  initial,
  submitLabel = "Save",
  preview = null,
  onDone,
  extraBody,
  intro,
}: {
  fields: Field[];
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT";
  initial?: Record<string, unknown>;
  submitLabel?: string;
  preview?: Preview;
  onDone?: (result: unknown) => void;
  extraBody?: Record<string, unknown>;
  intro?: ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(fields, initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => fields.filter((f) => !f.showIf || f.showIf.in.includes(String(values[f.showIf.field] ?? ""))),
    [fields, values],
  );

  function set(name: string, value: string | boolean) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const body: Record<string, unknown> = { ...extraBody };
    for (const f of visible) {
      const v = values[f.name];
      body[f.name] = f.type === "checkbox" ? Boolean(v) : v === "" ? null : v;
    }
    if (needsReason) body.correctionReason = reason;
    try {
      const result = await api(endpoint, { method, body });
      toast("Saved");
      router.refresh();
      onDone?.(result);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "year_locked" && !err.message.includes("archived")) {
          setNeedsReason(true);
        }
        setErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("Could not save. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate id="pt-entity-form">
      {intro}
      {formError ? (
        <div className="pt-alert error" role="alert" style={{ marginBottom: "1rem" }}>
          {formError}
        </div>
      ) : null}
      <div className="pt-form">
        {visible.map((f) => (
          <FieldInput key={f.name} field={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
        <PreviewBox kind={preview} v={values} />
        {needsReason ? (
          <div className="pt-field span-2">
            <label htmlFor="correctionReason">
              Correction reason <span className="req">*</span>
            </label>
            <input id="correctionReason" className="pt-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does a closed year need this change?" required />
            <span className="pt-help">The financial year is closed. Your reason is recorded in the audit log.</span>
          </div>
        ) : null}
      </div>
      <div className="pt-actions" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
        <button type="submit" className="pt-btn pt-btn-primary" disabled={busy || (needsReason && !reason.trim())}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function FieldInput({ field: f, value, error, onChange }: { field: Field; value: string | boolean | undefined; error?: string; onChange: (v: string | boolean) => void }) {
  const id = `fld-${f.name}`;
  const common = {
    id,
    name: f.name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-err` : f.help ? `${id}-help` : undefined,
    readOnly: f.readOnly,
  };
  let input: ReactNode;
  if (f.type === "checkbox") {
    return (
      <div className={`pt-field${f.span === 2 ? " span-2" : ""}`}>
        <label className="pt-check" htmlFor={id}>
          <input {...common} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {f.label}
        </label>
        {f.help ? (
          <span className="pt-help" id={`${id}-help`}>
            {f.help}
          </span>
        ) : null}
      </div>
    );
  }
  if (f.type === "select") {
    input = (
      <select {...common} className="pt-select" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={f.required}>
        {!f.required || !value ? <option value="">{f.emptyLabel ?? (f.required ? "Select…" : "— None —")}</option> : null}
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (f.type === "textarea") {
    input = <textarea {...common} className="pt-textarea" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} required={f.required} />;
  } else {
    const type = f.type === "money" || f.type === "percent" ? "text" : f.type;
    input = (
      <input
        {...common}
        className="pt-input"
        type={type}
        inputMode={f.type === "money" || f.type === "percent" || f.type === "number" ? "decimal" : undefined}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder ?? (f.type === "money" ? "0.00" : f.type === "percent" ? "e.g. 18" : undefined)}
        required={f.required}
        step={f.step}
        min={f.min}
        max={f.max}
        autoComplete={f.type === "password" ? "new-password" : undefined}
      />
    );
  }
  return (
    <div className={`pt-field${f.span === 2 || f.type === "textarea" ? " span-2" : ""}`}>
      <label htmlFor={id}>
        {f.label}
        {f.required ? <span className="req"> *</span> : null}
      </label>
      {input}
      {error ? (
        <span className="pt-error-text" id={`${id}-err`}>
          {error}
        </span>
      ) : f.help ? (
        <span className="pt-help" id={`${id}-help`}>
          {f.help}
        </span>
      ) : null}
    </div>
  );
}

/** Button that opens a right-side drawer containing an EntityForm. */
export function FormDrawer({
  label,
  title,
  icon = "plus",
  variant = "primary",
  size,
  ...form
}: {
  label: string;
  title: string;
  icon?: IconName | null;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
} & Parameters<typeof EntityForm>[0]) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`pt-btn pt-btn-${variant}${size ? " pt-btn-sm" : ""}`} onClick={() => setOpen(true)}>
        {icon ? <Icon name={icon} /> : null}
        {label}
      </button>
      {open ? (
        <Drawer title={title} onClose={() => setOpen(false)}>
          <EntityForm {...form} onDone={(r) => (form.onDone ? form.onDone(r) : setOpen(false))} />
        </Drawer>
      ) : null}
    </>
  );
}

export function Drawer({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="pt-overlay" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pt-drawer" style={wide ? { width: "min(64rem, 100vw)" } : undefined}>
        <div className="pt-drawer-head">
          <h2 className="pt-card-title">{title}</h2>
          <button type="button" className="pt-btn pt-btn-ghost pt-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="pt-drawer-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * One-click action (archive, restore, status change, delete). Confirms first; if the year is
 * closed the server asks for a correction reason and the button prompts for it.
 */
export function ActionButton({
  label,
  endpoint,
  method = "POST",
  body,
  confirm,
  icon,
  variant = "ghost",
  size = "sm",
  askReason,
  successMessage = "Done",
  redirectTo,
  title,
}: {
  label: string;
  endpoint: string;
  method?: "POST" | "DELETE" | "PATCH" | "PUT";
  body?: Record<string, unknown>;
  confirm?: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  askReason?: string;
  successMessage?: string;
  redirectTo?: string;
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    let extra: Record<string, unknown> = {};
    if (askReason) {
      const r = window.prompt(askReason);
      if (r === null) return;
      extra = { reason: r };
    }
    setBusy(true);
    try {
      await api(endpoint, { method, body: { ...body, ...extra } });
      toast(successMessage);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "year_locked" && !err.message.includes("archived")) {
        const reason = window.prompt(`${err.message}\n\nCorrection reason:`);
        if (reason) {
          try {
            await api(endpoint, { method, body: { ...body, ...extra, correctionReason: reason } });
            toast(successMessage);
            router.refresh();
          } catch (e2) {
            toast(e2 instanceof Error ? e2.message : "Failed", "error");
          }
        }
      } else {
        toast(err instanceof Error ? err.message : "Failed", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={`pt-btn pt-btn-${variant}${size === "sm" ? " pt-btn-sm" : ""}`} onClick={run} disabled={busy} title={title ?? label}>
      {icon ? <Icon name={icon} /> : null}
      {label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="pt-btn pt-btn-ghost" onClick={() => window.print()}>
      <Icon name="print" /> Print
    </button>
  );
}
