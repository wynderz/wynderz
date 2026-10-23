"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type FilterField =
  | { name: string; label: string; type: "search"; placeholder?: string }
  | { name: string; label: string; type: "select"; options: Array<{ value: string; label: string }>; allLabel?: string }
  | { name: string; label: string; type: "date" | "month" };

/** URL-driven filters: every change updates the query string, so views are linkable and server-rendered. */
export function FilterBar({ fields, children }: { fields: FilterField[]; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setSearch(params.get("q") ?? ""), [params]);

  function apply(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function onSearch(value: string, name: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(name, value.trim()), 350);
  }

  const hasFilters = fields.some((f) => params.get(f.name));

  return (
    <div className="pt-toolbar">
      {fields.map((f) => (
        <div key={f.name} className={`pt-field${f.type === "search" ? " pt-search" : ""}`}>
          <label htmlFor={`f-${f.name}`}>{f.label}</label>
          {f.type === "search" ? (
            <input id={`f-${f.name}`} className="pt-input" type="search" value={search} placeholder={f.placeholder ?? "Search…"} onChange={(e) => onSearch(e.target.value, f.name)} />
          ) : f.type === "select" ? (
            <select id={`f-${f.name}`} className="pt-select" value={params.get(f.name) ?? ""} onChange={(e) => apply(f.name, e.target.value)}>
              <option value="">{f.allLabel ?? "All"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input id={`f-${f.name}`} className="pt-input" type={f.type} value={params.get(f.name) ?? ""} onChange={(e) => apply(f.name, e.target.value)} />
          )}
        </div>
      ))}
      {hasFilters ? (
        <button
          type="button"
          className="pt-btn pt-btn-ghost"
          onClick={() => {
            const next = new URLSearchParams();
            for (const k of ["fy", "tab", "view"]) if (params.get(k)) next.set(k, params.get(k)!);
            router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
          }}
        >
          Clear filters
        </button>
      ) : null}
      {children}
    </div>
  );
}
