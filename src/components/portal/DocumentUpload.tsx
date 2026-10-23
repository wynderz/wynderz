"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, toast } from "./client";
import { Drawer, FieldInput, type Field, type Values } from "./forms";
import { Icon } from "./icons";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.docx,.doc,.pptx,.csv,.txt,.dwg,.dxf,.zip";

type Presets = {
  projectId?: number | string | null;
  supplierId?: number | string | null;
  expenseId?: number | string | null;
  materialId?: number | string | null;
  financialYearId?: number | string | null;
  docType?: string | null;
};

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "Upload document" button + drawer. Posts multipart FormData ("file" + metadata) to /api/portal/documents.
 * Other pages can embed it with presets (e.g. supplierId) so the upload is linked automatically.
 */
export function DocumentUpload({
  fields,
  maxMb = 15,
  label = "Upload document",
  variant = "primary",
  size,
  ...presets
}: {
  fields: Field[];
  maxMb?: number;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
} & Presets) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`pt-btn pt-btn-${variant}${size ? " pt-btn-sm" : ""}`} onClick={() => setOpen(true)}>
        <Icon name="upload" />
        {label}
      </button>
      {open ? (
        <Drawer title="Upload document" onClose={() => setOpen(false)}>
          <UploadForm fields={fields} maxMb={maxMb} presets={presets} onDone={() => setOpen(false)} />
        </Drawer>
      ) : null}
    </>
  );
}

function UploadForm({ fields, maxMb, presets, onDone }: { fields: Field[]; maxMb: number; presets: Presets; onDone: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) {
      const p = presets[f.name as keyof Presets];
      v[f.name] = f.type === "checkbox" ? false : p === null || p === undefined ? "" : String(p);
    }
    if (!v.docType && fields.some((f) => f.name === "docType")) v.docType = "other";
    return v;
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const maxBytes = maxMb * 1024 * 1024;

  function set(name: string, value: string | boolean) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  }

  function onFile(f: File | null) {
    setFile(f);
    setErrors((e) => {
      const next = { ...e };
      delete next.file;
      return next;
    });
    if (f && !String(values.title ?? "").trim()) set("title", f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!file) {
      setErrors((x) => ({ ...x, file: "Choose a file to upload." }));
      return;
    }
    if (file.size > maxBytes) {
      setErrors((x) => ({ ...x, file: `File is ${formatSize(file.size)}; the limit is ${maxMb} MB.` }));
      return;
    }
    const form = new FormData();
    form.append("file", file);
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "checkbox") form.append(f.name, v ? "true" : "false");
      else if (v !== undefined && v !== "" && v !== false) form.append(f.name, String(v));
    }
    setBusy(true);
    try {
      await api("/api/portal/documents", { method: "POST", form });
      toast("Document uploaded");
      router.refresh();
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        setFormError(err.message);
      } else {
        setFormError("Could not upload. Please try again.");
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
        <div className="pt-field span-2">
          <label htmlFor="doc-upload-file">
            File <span className="req">*</span>
          </label>
          <input
            id="doc-upload-file"
            name="file"
            type="file"
            className="pt-input"
            accept={ACCEPT}
            required
            aria-invalid={errors.file ? true : undefined}
            aria-describedby={errors.file ? "doc-upload-file-err" : "doc-upload-file-help"}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {errors.file ? (
            <span className="pt-error-text" id="doc-upload-file-err">
              {errors.file}
            </span>
          ) : (
            <span className="pt-help" id="doc-upload-file-help">
              {file ? `${file.name} · ${formatSize(file.size)}. ` : ""}Max {maxMb} MB. PDF, images, Office files, CSV/TXT, DWG/DXF or ZIP. Files are stored privately.
            </span>
          )}
        </div>
        {fields.map((f) => (
          <FieldInput key={f.name} field={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
      </div>
      <div className="pt-actions" style={{ justifyContent: "flex-end", marginTop: "1.25rem" }}>
        <button type="submit" className="pt-btn pt-btn-primary" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}
