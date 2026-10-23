/** Server-compatible presentational components shared by every portal page. */
import Link from "next/link";
import type { ReactNode } from "react";
import { withParams } from "@/lib/portal/url";
import { compactINR, formatINR, labelize, statusTone, type Tone } from "./format";
import { Icon } from "./icons";

export function PageHeader({ title, subtitle, crumbs, actions }: { title: ReactNode; subtitle?: ReactNode; crumbs?: Array<{ href?: string; label: string }>; actions?: ReactNode }) {
  return (
    <div className="pt-page-head">
      <div>
        {crumbs?.length ? (
          <nav className="pt-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i}>
                {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                {i < crumbs.length - 1 ? " /" : ""}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="pt-title">{title}</h1>
        {subtitle ? <p className="pt-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="pt-actions">{actions}</div> : null}
    </div>
  );
}

export function Kpis({ children }: { children: ReactNode }) {
  return <div className="pt-kpis">{children}</div>;
}

export function Kpi({ label, value, hint, tone, money = true, compact = true }: { label: string; value: string | number | null | undefined; hint?: ReactNode; tone?: "warn" | "danger" | "info" | "success" | "navy"; money?: boolean; compact?: boolean }) {
  const display = money ? (compact ? compactINR(value) : formatINR(value)) : value ?? "—";
  return (
    <div className={`pt-kpi${tone ? ` tone-${tone}` : ""}`}>
      <div className="pt-kpi-label">{label}</div>
      <div className="pt-kpi-value" title={money ? formatINR(value) : undefined}>
        {display}
      </div>
      {hint ? <div className="pt-kpi-hint">{hint}</div> : null}
    </div>
  );
}

export function Card({ title, sub, actions, children, flush, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`pt-card${flush ? " pt-flush" : ""}${className ? ` ${className}` : ""}`}>
      {title || actions ? (
        <div className="pt-card-head" style={flush ? { padding: "0.9rem 1rem 0" } : undefined}>
          <div>
            {title ? <h2 className="pt-card-title">{title}</h2> : null}
            {sub ? <div className="pt-card-sub">{sub}</div> : null}
          </div>
          {actions ? <div className="pt-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ status, tone, children }: { status?: string | null; tone?: Tone; children?: ReactNode }) {
  const t = tone ?? statusTone(status);
  return <span className={`pt-badge${t ? ` ${t}` : ""}`}>{children ?? labelize(status)}</span>;
}

export function Money({ value, muted }: { value: string | number | null | undefined; muted?: boolean }) {
  return <span className={muted ? "muted" : undefined}>{formatINR(value)}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="pt-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

/** Sortable column header that toggles ?sort=&dir= in the URL. */
export function SortTh({ label, sortKey, base, params, className }: { label: string; sortKey: string; base: string; params: Record<string, string>; className?: string }) {
  const active = params.sort === sortKey;
  const dir = active && params.dir === "asc" ? "desc" : "asc";
  return (
    <th className={className} aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={withParams(base, params, { sort: sortKey, dir, page: null })}>
        {label}
        {active ? (params.dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

export function Pagination({ base, params, page, pageCount, total, pageSize }: { base: string; params: Record<string, string>; page: number; pageCount: number; total: number; pageSize: number }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="pt-pagination">
      <span>
        {start.toLocaleString("en-IN")}–{end.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </span>
      <div className="pt-actions">
        {page > 1 ? (
          <Link className="pt-btn pt-btn-secondary pt-btn-sm" href={withParams(base, params, { page: page - 1 })}>
            ← Previous
          </Link>
        ) : (
          <span className="pt-btn pt-btn-secondary pt-btn-sm" aria-disabled style={{ opacity: 0.5 }}>
            ← Previous
          </span>
        )}
        <span style={{ padding: "0 0.4rem" }}>
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link className="pt-btn pt-btn-secondary pt-btn-sm" href={withParams(base, params, { page: page + 1 })}>
            Next →
          </Link>
        ) : (
          <span className="pt-btn pt-btn-secondary pt-btn-sm" aria-disabled style={{ opacity: 0.5 }}>
            Next →
          </span>
        )}
      </div>
    </div>
  );
}

/** Excel / CSV download links for a report, carrying the current filters. */
export function ExportLinks({ report, params, label = "Export" }: { report: string; params: Record<string, string>; label?: string }) {
  const keep: Record<string, string> = {};
  for (const k of ["fy", "from", "to", "projectId", "categoryId", "employeeId", "q"]) if (params[k]) keep[k] = params[k];
  return (
    <>
      <a className="pt-btn pt-btn-secondary" href={withParams(`/api/portal/reports/${report}`, keep, { format: "xlsx" })}>
        <Icon name="download" /> {label} Excel
      </a>
      <a className="pt-btn pt-btn-ghost" href={withParams(`/api/portal/reports/${report}`, keep, { format: "csv" })}>
        CSV
      </a>
    </>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`pt-progress${max > 0 && value > max ? " over" : ""}`} title={`${pct.toFixed(0)}%`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: Array<{ key: string; label: string; href: string }>; active: string }) {
  return (
    <nav className="pt-tabs" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={t.key === active ? "active" : undefined} aria-current={t.key === active ? "page" : undefined} scroll={false}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
