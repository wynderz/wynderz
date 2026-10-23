"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactINR, formatINR } from "./format";

type Palette = { series: string[]; grid: string; text: string; surface: string };

/** Reads chart colours from the portal's CSS tokens and follows light/dark switches. */
const DEFAULT_PALETTE: Palette = { series: ["#506600", "#2f6fb0", "#c27c0e", "#7c4dbd", "#0f8a7e", "#b8435a"], grid: "#e2e8f0", text: "#6b7480", surface: "#fff" };

function usePalette(): Palette {
  const read = (): Palette => {
    const el = document.querySelector(".pt-app") ?? document.documentElement;
    const cs = getComputedStyle(el);
    const v = (k: string) => cs.getPropertyValue(k).trim();
    return {
      series: [1, 2, 3, 4, 5, 6].map((i) => v(`--pt-chart-${i}`) || "#506600"),
      grid: v("--pt-border") || "#e2e8f0",
      text: v("--pt-muted") || "#6b7480",
      surface: v("--pt-surface") || "#fff",
    };
  };
  // Same first render on server and client (avoids hydration mismatch); real tokens applied after mount.
  const [p, setP] = useState<Palette>(DEFAULT_PALETTE);
  useEffect(() => {
    setP(read());
    const obs = new MutationObserver(() => setP(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return p;
}

/** Short axis labels: ₹60L, ₹1.2Cr, ₹15K. */
function axis(v: number) {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${+(v / 1e3).toFixed(0)}K`;
  return `₹${v}`;
}

const tooltipStyle = (p: Palette) => ({
  contentStyle: { background: p.surface, border: `1px solid ${p.grid}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { fontWeight: 700 },
});

export type Series = { key: string; label: string; stack?: string; type?: "bar" | "line" };

/** Bars per category on the x-axis (stacked when series share a `stack`), optional line series. */
export function MoneyBars({ data, xKey, series, height = 280 }: { data: Array<Record<string, string | number>>; xKey: string; series: Series[]; height?: number }) {
  const p = usePalette();
  if (!data.length) return <div className="pt-empty">No data for this period yet.</div>;
  const rows = data.map((d) => {
    const r: Record<string, string | number> = { ...d };
    for (const s of series) r[s.key] = Number(d[s.key] ?? 0);
    return r;
  });
  return (
    <div className="pt-chart" style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: p.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: p.grid }} />
          <YAxis tickFormatter={axis} tick={{ fill: p.text, fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
          <Tooltip formatter={(v: number, name) => [formatINR(v), name]} {...tooltipStyle(p)} cursor={{ fill: p.grid, opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: p.text }} iconType="square" iconSize={10} />
          {series.map((s, i) =>
            s.type === "line" ? (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={p.series[i % p.series.length]} strokeWidth={2} dot={{ r: 3 }} type="linear" />
            ) : (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId={s.stack} fill={p.series[i % p.series.length]} radius={s.stack ? 0 : [3, 3, 0, 0]} maxBarSize={44} />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars — good for long labels (projects, suppliers). */
export function HBars({ data, labelKey, valueKey, secondaryKey, secondaryLabel, valueLabel = "Actual", height }: { data: Array<Record<string, string | number>>; labelKey: string; valueKey: string; secondaryKey?: string; secondaryLabel?: string; valueLabel?: string; height?: number }) {
  const p = usePalette();
  if (!data.length) return <div className="pt-empty">No data for this period yet.</div>;
  const rows = data.map((d) => ({ ...d, [valueKey]: Number(d[valueKey] ?? 0), ...(secondaryKey ? { [secondaryKey]: Number(d[secondaryKey] ?? 0) } : {}) }));
  return (
    <div className="pt-chart" style={{ height: height ?? Math.max(180, rows.length * (secondaryKey ? 44 : 32) + 40) }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={p.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={axis} tick={{ fill: p.text, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey={labelKey} tick={{ fill: p.text, fontSize: 11 }} width={120} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v: number, name) => [formatINR(v), name]} {...tooltipStyle(p)} cursor={{ fill: p.grid, opacity: 0.4 }} />
          {secondaryKey ? <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} /> : null}
          {secondaryKey ? <Bar dataKey={secondaryKey} name={secondaryLabel} fill={p.series[1]} radius={[0, 3, 3, 0]} maxBarSize={14} /> : null}
          <Bar dataKey={valueKey} name={valueLabel} fill={p.series[0]} radius={[0, 3, 3, 0]} maxBarSize={secondaryKey ? 14 : 18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with a legend list (category breakdown). Small slices are grouped into "Other". */
export function Donut({ data, labelKey, valueKey, max = 6 }: { data: Array<Record<string, string | number>>; labelKey: string; valueKey: string; max?: number }) {
  const p = usePalette();
  const sorted = [...data].map((d) => ({ name: String(d[labelKey]), value: Number(d[valueKey] ?? 0) })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (!sorted.length) return <div className="pt-empty">No data for this period yet.</div>;
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((a, b) => a + b.value, 0);
  const rows = rest > 0 ? [...head, { name: "Other", value: rest }] : head;
  const total = rows.reduce((a, b) => a + b.value, 0);
  const colors = [...p.series, p.text];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
      <div style={{ width: 180, height: 180, flex: "none" }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="95%" stroke={p.surface} strokeWidth={2} isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, name) => [formatINR(v), name]} {...tooltipStyle(p)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "0.8rem", display: "grid", gap: "0.35rem", flex: "1 1 14rem", minWidth: 0 }}>
        {rows.map((r, i) => (
          <li key={r.name} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span className="pt-dot" style={{ background: colors[i % colors.length] }} />
              {r.name}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {compactINR(r.value)} <span style={{ color: "var(--pt-muted)" }}>{((r.value / total) * 100).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
