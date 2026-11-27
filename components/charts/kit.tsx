"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Section 4.2 tokens (charts may use only these).
export const C = {
  navy: "#14213D",
  teal: "#1F7A8C",
  orange: "#E07A2E",
  purple: "#8A6FB0",
  grey: "#B8BEC6",
  dark: "#3A3F47",
  ink: "#1E2430",
  muted: "#6A7380",
  light: "#E9EDF1",
  panel: "#F4F6F8",
  bad: "#C62828",
  amber: "#B26A00",
} as const;

export type ColorName = keyof typeof C;

export const NARROW = 560;

/** Measures its own width so charts can adapt label density (375px vs 1280px). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Sized box; renders the chart once the width is known. */
export function ChartBox({ height, children }: { height: number; children: (width: number) => ReactNode }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="chart-box w-full" style={{ height }}>
      {width > 0 ? children(width) : null}
    </div>
  );
}

export const tick = { fontSize: 11, fill: C.dark };
export const axisLine = { stroke: C.grey };
export const gridProps = { stroke: C.light, strokeWidth: 1, vertical: false } as const;

/** White halo so direct labels stay legible where they cross marks. */
export const halo: CSSProperties = {
  paintOrder: "stroke",
  stroke: "#ffffff",
  strokeWidth: 3,
  strokeLinejoin: "round",
};

export function labelStyle(size = 11, weight = 600): CSSProperties {
  return { ...halo, fontSize: size, fontWeight: weight, fill: C.ink };
}

export function compact(n: number, digits = 1): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(digits === 1 ? 2 : digits)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : digits)}K`;
  return n.toLocaleString("en-US");
}

export function LegendRow({ items }: { items: { label: string; color: ColorName; kind?: "line" | "box" | "tick" }[] }) {
  return (
    <ul className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dark">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.kind === "line" ? (
            <span className="inline-block h-[2px] w-4 rounded" style={{ background: C[it.color] }} />
          ) : it.kind === "tick" ? (
            <span className="inline-block h-3 w-[3px] rounded" style={{ background: C[it.color] }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C[it.color] }} />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export interface TipRow {
  name: string;
  value: string;
  color?: ColorName;
}

/** Tooltip body: exact value, period and source (spec 4.5). */
export function TipBox({ title, rows, source }: { title: string; rows: TipRow[]; source: string }) {
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-[12px] shadow-md">
      <p className="font-semibold text-navy">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-1.5 text-ink">
          {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: C[r.color] }} />}
          <span className="text-muted">{r.name}:</span> <span className="font-semibold">{r.value}</span>
        </p>
      ))}
      <p className="mt-0.5 text-[11px] text-muted">Source: {source}</p>
    </div>
  );
}

/** Multi-line SVG tick. Lines are split on "\n". */
export function MultiTick({
  x,
  y,
  lines,
  size = 11,
  anchor = "middle",
  mutedFrom = 99,
}: {
  x: number;
  y: number;
  lines: string[];
  size?: number;
  anchor?: "middle" | "end" | "start";
  mutedFrom?: number;
}) {
  return (
    <text x={x} y={y + size + 2} textAnchor={anchor} style={{ fontSize: size }}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size + 2} fill={i >= mutedFrom ? C.muted : C.dark}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Push labels apart vertically (pixel space) so none are closer than `gap`. */
export function spreadLabels(items: { key: string; y: number }[], gap: number, minY: number, maxY: number) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const pos = sorted.map((s) => s.y);
  for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] < gap) pos[i] = pos[i - 1] + gap;
  const overflow = pos.length ? pos[pos.length - 1] - maxY : 0;
  if (overflow > 0) for (let i = 0; i < pos.length; i++) pos[i] -= overflow;
  for (let i = 0; i < pos.length; i++) pos[i] = Math.max(pos[i], minY);
  const out: Record<string, number> = {};
  sorted.forEach((s, i) => (out[s.key] = pos[i] - s.y));
  return out;
}
