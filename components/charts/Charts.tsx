"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Charts C1–C17 (spec Section 7) with Recharts. Each chart labels key points directly,
// keeps the top/right axes off, uses light grid lines and only Section 4.2 colors.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  C,
  ChartBox,
  LegendRow,
  MultiTick,
  NARROW,
  TipBox,
  axisLine,
  compact,
  gridProps,
  halo,
  labelStyle,
  spreadLabels,
  tick,
  type ColorName,
} from "./kit";

const FULL = 240;
const HALF = 200;
const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const int = (v: number) => Math.round(v).toLocaleString("en-US");
const yearTicks = (narrow: boolean) => (narrow ? [2006, 2010, 2014, 2018, 2022, 2025] : [2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2025]);
const barSize = (width: number, n: number, share = 0.62) => Math.max(3, Math.min(24, Math.floor(((width - 60) / n) * share)));
const tipCursor = { fill: "rgba(20,33,61,0.05)" };
const lineCursor = { stroke: C.grey, strokeWidth: 1 };

/** Text label anchored at an SVG point. */
function Lbl({ x, y, text, anchor = "middle", size = 11, weight = 600, fill }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end"; size?: number; weight?: number; fill?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ ...labelStyle(size, weight), ...(fill ? { fill } : {}) }}>
      {text}
    </text>
  );
}

/** Label to the right of a ReferenceDot, shifted vertically by dy pixels. */
function endLabel(text: string, dy = 0) {
  const EndLabel = (p: any) => {
    const vb = p.viewBox ?? {};
    const cx = (vb.x ?? 0) + (vb.width ?? 0) / 2;
    const cy = (vb.y ?? 0) + (vb.height ?? 0) / 2;
    return <Lbl x={cx + 8} y={cy + dy + 4} text={text} anchor="start" />;
  };
  return EndLabel;
}

// ============================================================================ C1
export function C1({ data }: { data: { year: number; unemp: number; mort: number }[] }) {
  const last = data[data.length - 1];
  const peak = data.reduce((a, b) => (b.unemp > a.unemp ? b : a));
  const low = data.reduce((a, b) => (b.mort < a.mort ? b : a));
  return (
    <>
      <LegendRow items={[{ label: "Unemployment rate", color: "teal", kind: "line" }, { label: "30-yr mortgage rate", color: "orange", kind: "line" }]} />
      <ChartBox height={FULL}>
        {(w) => (
          <LineChart width={w} height={FULL} data={data} margin={{ top: 22, right: 44, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <ReferenceArea x1={2007.5} x2={2009.5} fill={C.light} fillOpacity={0.9} ifOverflow="hidden" label={{ value: "Recession", position: "insideTop", style: { fontSize: 10, fill: C.muted } }} />
            <ReferenceArea x1={2019.5} x2={2020.5} fill={C.light} fillOpacity={0.9} ifOverflow="hidden" label={{ value: "Pandemic", position: "insideTop", style: { fontSize: 10, fill: C.muted } }} />
            <XAxis dataKey="year" type="number" domain={[2006, 2025]} padding={{ left: 8, right: 0 }} ticks={yearTicks(w < NARROW)} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} width={36} />
            <Tooltip cursor={lineCursor} content={({ active, payload, label }: any) => active && payload?.length ? (
              <TipBox title={`${label} annual average`} source="BLS via FRED; Freddie Mac via FRED" rows={[
                { name: "Unemployment", value: pct(payload[0].payload.unemp, 2), color: "teal" },
                { name: "30-yr mortgage", value: pct(payload[0].payload.mort, 2), color: "orange" },
              ]} />) : null} />
            <Line dataKey="unemp" stroke={C.teal} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            <Line dataKey="mort" stroke={C.orange} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            <ReferenceDot x={peak.year} y={peak.unemp} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} label={{ value: `${pct(peak.unemp)} (${peak.year})`, position: "top", style: labelStyle() }} />
            <ReferenceDot x={low.year} y={low.mort} r={4} fill={C.orange} stroke="#fff" strokeWidth={2} label={{ value: `${pct(low.mort, 2)} (${low.year})`, position: "bottom", style: labelStyle() }} />
            <ReferenceDot x={last.year} y={last.unemp} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} label={{ value: pct(last.unemp), position: "right", style: labelStyle() }} />
            <ReferenceDot x={last.year} y={last.mort} r={4} fill={C.orange} stroke="#fff" strokeWidth={2} label={{ value: pct(last.mort), position: "right", style: labelStyle() }} />
          </LineChart>
        )}
      </ChartBox>
    </>
  );
}

// ============================================================================ C2
export function C2({ data }: { data: { year: number; fc: number | null; bk: number | null; fcRaw: number | null; bkRaw: number | null }[] }) {
  const last = data[data.length - 1];
  const peak = data.reduce((a, b) => ((b.fc ?? 0) > (a.fc ?? 0) ? b : a));
  const fcAbove = (last.fc ?? 0) > (last.bk ?? 0);
  return (
    <>
      <LegendRow items={[{ label: "Foreclosure filings (properties)", color: "navy", kind: "line" }, { label: "Bankruptcy filings", color: "teal", kind: "line" }]} />
      <ChartBox height={FULL}>
        {(w) => (
          <LineChart width={w} height={FULL} data={data} margin={{ top: 22, right: 46, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" type="number" domain={[2006, 2025]} padding={{ left: 8, right: 0 }} ticks={yearTicks(w < NARROW)} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
            <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v) => `${v}M`} tick={tick} axisLine={false} tickLine={false} width={34} />
            <Tooltip cursor={lineCursor} content={({ active, payload, label }: any) => active && payload?.length ? (
              <TipBox title={String(label)} source="RealtyTrac/ATTOM; U.S. Courts" rows={[
                { name: "Foreclosure filings", value: payload[0].payload.fcRaw == null ? "—" : int(payload[0].payload.fcRaw), color: "navy" },
                { name: "Bankruptcy filings", value: payload[0].payload.bkRaw == null ? "—" : int(payload[0].payload.bkRaw), color: "teal" },
              ]} />) : null} />
            <Line dataKey="fc" stroke={C.navy} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            <Line dataKey="bk" stroke={C.teal} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <ReferenceDot x={peak.year} y={peak.fc!} r={4} fill={C.navy} stroke="#fff" strokeWidth={2} label={{ value: `${peak.fc!.toFixed(2)}M peak (${peak.year})`, position: "top", style: labelStyle() }} />
            <ReferenceDot x={last.year} y={last.fc!} r={4} fill={C.navy} stroke="#fff" strokeWidth={2} label={endLabel(`${last.fc!.toFixed(2)}M`, fcAbove ? -6 : 6)} />
            <ReferenceDot x={last.year} y={last.bk!} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} label={endLabel(`${last.bk!.toFixed(2)}M`, fcAbove ? 6 : -6)} />
          </LineChart>
        )}
      </ChartBox>
    </>
  );
}

// ============================================================================ C3
export function C3({ data }: { data: { year: string; total: number; ai: number; aiPct: number }[] }) {
  return (
    <>
      <LegendRow items={[{ label: "All announced job cuts", color: "grey" }, { label: "AI-cited cuts (share shown under each year)", color: "teal" }]} />
      <ChartBox height={FULL + 20}>
        {(w) => {
          const narrow = w < NARROW;
          const bs = barSize(w, data.length, 0.7);
          const fs = narrow ? 9 : 11;
          return (
            <BarChart width={w} height={FULL + 20} data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barGap={-bs} barSize={bs}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="year"
                interval={0}
                height={narrow ? 34 : 36}
                axisLine={axisLine}
                tickLine={false}
                tick={({ x, y, payload, index }: any) => {
                  const d = data[index];
                  const yr = narrow ? `’${String(payload.value).slice(2, 4)}` : String(payload.value).replace(" YTD", "*");
                  const share = d && d.ai > 0 ? (narrow ? pct(d.aiPct) : `AI ${pct(d.aiPct)}`) : "";
                  return <MultiTick x={x} y={y} lines={[yr, share]} size={fs} mutedFrom={1} />;
                }}
              />
              <YAxis tickFormatter={(v) => compact(v, 0)} tick={tick} axisLine={false} tickLine={false} width={40} domain={[0, 2500000]} ticks={[0, 500000, 1000000, 1500000, 2000000, 2500000]} />
              <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
                <TipBox title={payload[0].payload.year === "2026 YTD" ? "2026 (Jan–Oct)" : payload[0].payload.year} source="Challenger, Gray & Christmas" rows={[
                  { name: "All cuts", value: int(payload[0].payload.total), color: "grey" },
                  { name: "AI-cited", value: `${int(payload[0].payload.ai)} (${pct(payload[0].payload.aiPct)})`, color: "teal" },
                ]} />) : null} />
              <Bar dataKey="total" fill={C.grey} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                <LabelList dataKey="total" position="top" content={({ x, y, width, value }: any) => (
                  <Lbl x={x + width / 2} y={y - 5} text={compact(value, narrow ? 1 : 2)} size={fs} weight={600} />
                )} />
              </Bar>
              <Bar dataKey="ai" fill={C.teal} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          );
        }}
      </ChartBox>
    </>
  );
}

// ============================================================================ C4
interface C4Row { key: string; label: string; tick: string; year: number; value: number | null }
export function C4({ data }: { data: { rows: C4Row[]; annotations: { from: string; to: string; text: string }[] } }) {
  const rows = data.rows.map((r) => ({ ...r, plot: r.value ?? 0 }));
  const maxYear = Math.max(...rows.map((r) => r.year));
  const peakIdx = rows.reduce((bi, r, i) => ((r.value ?? -1) > (rows[bi].value ?? -1) ? i : bi), 0);
  const lastIdx = rows.map((r) => r.value != null).lastIndexOf(true);
  const yearAgoIdx = rows.findIndex((r) => r.key === `${maxYear - 1}-${rows[lastIdx].key.slice(5)}`);
  const labelled = new Map<number, string>([
    [peakIdx, `${compact(rows[peakIdx].value!)} (${rows[peakIdx].label})`],
    [yearAgoIdx, compact(rows[yearAgoIdx].value!)],
    [lastIdx, int(rows[lastIdx].value!)],
  ]);
  return (
    <>
      <LegendRow items={[{ label: String(maxYear), color: "teal" }, { label: "Earlier years", color: "grey" }]} />
      <ChartBox height={FULL}>
        {(w) => {
          const narrow = w < NARROW;
          const ticks = rows.filter((r, i) => (narrow ? r.key.endsWith("-01") : r.key.endsWith("-01") || r.key.endsWith("-07")) || i === lastIdx).map((r) => r.key);
          return (
            <BarChart width={w} height={FULL} data={rows} margin={{ top: 18, right: 24, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid {...gridProps} />
              {data.annotations.map((a) => (
                <ReferenceArea key={a.from} x1={a.from} x2={a.to} fill={C.panel} fillOpacity={1} ifOverflow="hidden"
                  label={(p: any) => {
                    const vb = p.viewBox;
                    const cx = vb.x + vb.width / 2;
                    const [head, tail] = a.text.split(": ");
                    return (
                      <text x={cx} y={vb.y + vb.height * 0.45} textAnchor="middle" style={{ ...halo, fontSize: 10, fill: C.muted }}>
                        <tspan x={cx}>{head}:</tspan>
                        <tspan x={cx} dy={12}>{tail}</tspan>
                      </text>
                    );
                  }} />
              ))}
              <XAxis dataKey="key" ticks={ticks} interval={0} tickFormatter={(k) => rows.find((r) => r.key === k)?.tick ?? k} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
              <YAxis domain={[0, 40000]} ticks={[0, 10000, 20000, 30000, 40000]} tickFormatter={(v) => compact(v, 0)} tick={tick} axisLine={false} tickLine={false} width={36} />
              <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
                <TipBox title={payload[0].payload.label} source="Challenger, Gray & Christmas" rows={[
                  { name: "AI-cited cuts", value: payload[0].payload.value == null ? "reported only as a combined total" : int(payload[0].payload.value) },
                ]} />) : null} />
              <Bar dataKey="plot" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                {rows.map((r) => <Cell key={r.key} fill={r.year === maxYear ? C.teal : C.grey} />)}
                <LabelList dataKey="plot" content={({ x, y, width, height, index }: any) => {
                  if (!labelled.has(index)) return null;
                  // Lift the label above any taller neighbor it would span.
                  const v = rows[index].plot;
                  const pxPer = v > 0 ? height / v : 0;
                  const span = rows.slice(Math.max(0, index - 3), index + 4).map((r) => r.plot);
                  const top = v > 0 ? y + height - Math.max(...span) * pxPer : y;
                  const ly = Math.min(y, top) - 5;
                  const cx = x + width / 2;
                  return (
                    <g>
                      {y - ly > 12 && <line x1={cx} y1={y - 2} x2={cx} y2={ly + 3} stroke={C.muted} strokeWidth={1} />}
                      <Lbl x={cx} y={ly} text={labelled.get(index)!} />
                    </g>
                  );
                }} />
              </Bar>
            </BarChart>
          );
        }}
      </ChartBox>
    </>
  );
}

// ============================================================================ C5
export function C5({ data }: { data: { year: number; v: number }[] }) {
  const peak = data.reduce((a, b) => (b.v > a.v ? b : a));
  const last = data[data.length - 1];
  return (
    <ChartBox height={HALF}>
      {(w) => (
        <AreaChart width={w} height={HALF} data={data} margin={{ top: 22, right: 48, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="year" type="number" domain={[2006, 2025]} padding={{ left: 8, right: 0 }} ticks={[2006, 2010, 2015, 2020, 2025]} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
          <YAxis domain={[0, 12]} ticks={[0, 4, 8, 12]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} width={34} />
          <Tooltip cursor={lineCursor} content={({ active, payload, label }: any) => active && payload?.length ? (
            <TipBox title={`Q4 ${label}`} source="Federal Reserve via FRED (CORCCACBS)" rows={[{ name: "Charge-off rate", value: pct(payload[0].payload.v, 2) }]} />) : null} />
          <Area dataKey="v" stroke={C.teal} strokeWidth={2} fill={C.teal} fillOpacity={0.1} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          <ReferenceDot x={peak.year} y={peak.v} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} label={{ value: `${pct(peak.v)} (${peak.year})`, position: "top", style: labelStyle() }} />
          <ReferenceDot x={last.year} y={last.v} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} label={{ value: pct(last.v, 2), position: "right", style: labelStyle() }} />
        </AreaChart>
      )}
    </ChartBox>
  );
}

// ============================================================================ C6
export function C6({ data }: { data: { label: string; tick: string; v: number; restated: boolean }[] }) {
  return (
    <>
      <LegendRow items={[{ label: "Before July 2026 restatement", color: "grey" }, { label: "Restated (latest)", color: "teal" }]} />
      <ChartBox height={HALF}>
        {(w) => (
          <BarChart width={w} height={HALF} data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} barSize={barSize(w, data.length, 0.6)}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" interval={0} height={40} axisLine={axisLine} tickLine={false}
              tick={({ x, y, index }: any) => {
                const d = data[index];
                const lines = d.restated ? ["Latest*", ""] : d.label.split(" ");
                return <MultiTick x={x} y={y} lines={lines} size={w < NARROW ? 10 : 11} />;
              }} />
            <YAxis domain={[0, 8]} ticks={[0, 2, 4, 6, 8]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} width={30} />
            <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
              <TipBox title={payload[0].payload.label} source="Fitch auto ABS index (via press coverage)" rows={[{ name: "60+ days late", value: pct(payload[0].payload.v, 2) }]} />) : null} />
            <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.label} fill={d.restated ? C.teal : C.grey} />)}
              <LabelList dataKey="v" content={({ x, y, width, value }: any) => <Lbl x={x + width / 2} y={y - 5} text={pct(value, 2)} size={w < NARROW ? 9.5 : 11} />} />
            </Bar>
          </BarChart>
        )}
      </ChartBox>
    </>
  );
}

// ============================================================================ C7
function PermitPanel({ data, dataKey, color, title, domain, mode }: { data: any[]; dataKey: string; color: ColorName; title: string; domain: number; mode: "low" | "peak" }) {
  const vals = data.map((d) => d[dataKey] as number);
  const target = mode === "low" ? vals.indexOf(Math.min(...vals)) : vals.indexOf(Math.max(...vals));
  const tv = vals[target];
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}M` : `${Math.round(v)}K`);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[12px] font-semibold text-dark">{title}</p>
      <ChartBox height={HALF}>
        {(w) => (
          <BarChart width={w} height={HALF} data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barSize={barSize(w, data.length, 0.66)}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" ticks={[2006, 2010, 2015, 2020, 2025]} interval={0} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
            <YAxis domain={[0, domain]} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}M` : `${v}K`)} tick={tick} axisLine={false} tickLine={false} width={38} />
            <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
              <TipBox title={String(payload[0].payload.year)} source="Census via FRED (NSA)" rows={[{ name: title, value: dataKey === "tx" ? `${int(payload[0].payload.txRaw)} units` : `${int(payload[0].payload.us * 1000)} units` }]} />) : null} />
            <Bar dataKey={dataKey} fill={C[color]} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey={dataKey} content={({ x, y, width, height, index }: any) => {
                if (index !== target) return null;
                const cx = x + width / 2;
                if (mode === "peak") return <Lbl x={cx} y={y - 6} text={`${fmt(tv)} (${data[index].year})`} />;
                // Low: leader line up and to the right, clear of the taller neighbors (spec 6.9).
                const pxPerUnit = height / tv;
                const base = y + height;
                const ly = base - Math.max(...vals.slice(target, target + 5)) * pxPerUnit - 14;
                return (
                  <g>
                    <line x1={cx} y1={y - 2} x2={cx} y2={ly + 3} stroke={C.muted} strokeWidth={1} />
                    <Lbl x={cx - 2} y={ly} text={`${fmt(tv)} low (${data[index].year})`} anchor="start" />
                  </g>
                );
              }} />
            </Bar>
          </BarChart>
        )}
      </ChartBox>
    </div>
  );
}

export function C7({ data }: { data: { year: number; us: number; tx: number; txRaw: number }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PermitPanel data={data} dataKey="us" color="navy" title="United States (thousands)" domain={2000} mode="low" />
      <PermitPanel data={data} dataKey="tx" color="teal" title="Texas (thousands)" domain={300} mode="peak" />
    </div>
  );
}

// ============================================================================ C8
export function C8({ data }: { data: { year: number; v: number }[] }) {
  const vals = data.map((d) => d.v);
  const low = vals.indexOf(Math.min(...vals));
  const last = data.length - 1;
  return (
    <ChartBox height={HALF}>
      {(w) => (
        <BarChart width={w} height={HALF} data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barSize={barSize(w, data.length, 0.66)}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="year" ticks={[2006, 2010, 2015, 2020, 2025]} interval={0} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
          <YAxis domain={[0, 125000]} ticks={[0, 40000, 80000, 120000]} tickFormatter={(v) => compact(v, 0)} tick={tick} axisLine={false} tickLine={false} width={38} />
          <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
            <TipBox title={String(payload[0].payload.year)} source={payload[0].payload.year >= 2025 ? "MHARR production" : "MHI shipments"} rows={[{ name: "Homes", value: int(payload[0].payload.v) }]} />) : null} />
          <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.year} fill={i === last ? C.teal : C.grey} />)}
            <LabelList dataKey="v" content={({ x, y, width, height, index }: any) => {
              const cx = x + width / 2;
              if (index === last) return <Lbl x={x + width} y={y - 8} text={`${compact(vals[last])} (${data[last].year})`} anchor="end" />;
              if (index !== low) return null;
              const pxPerUnit = height / vals[low];
              const ly = y + height - Math.max(...vals.slice(low, low + 6)) * pxPerUnit - 14;
              return (
                <g>
                  <line x1={cx} y1={y - 2} x2={cx} y2={ly + 3} stroke={C.muted} strokeWidth={1} />
                  <Lbl x={cx - 2} y={ly} text={`${compact(vals[low])} (${data[low].year})`} anchor="start" />
                </g>
              );
            }} />
          </Bar>
        </BarChart>
      )}
    </ChartBox>
  );
}

// ============================================================================ C9
export function C9({ data }: { data: { year: number; v: number }[] }) {
  const first = data[0];
  const last = data[data.length - 1];
  return (
    <>
      <LegendRow items={[{ label: "Moody's office vacancy", color: "navy", kind: "line" }, { label: "Prior record, 19.3% (1986, 1991)", color: "orange", kind: "line" }]} />
      <ChartBox height={HALF}>
        {(w) => (
          <LineChart width={w} height={HALF} data={data} margin={{ top: 22, right: 40, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" type="number" domain={[first.year, last.year]} padding={{ left: 22, right: 8 }} ticks={data.map((d) => d.year)} interval={0} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
            <YAxis domain={[14, 22]} ticks={[14, 16, 18, 20, 22]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} width={34} />
            <ReferenceLine y={19.3} stroke={C.orange} strokeWidth={1.5} strokeDasharray="5 4" />
            <Tooltip cursor={lineCursor} content={({ active, payload, label }: any) => active && payload?.length ? (
              <TipBox title={String(label)} source="Moody's" rows={[{ name: "Office vacancy", value: pct(payload[0].payload.v) }]} />) : null} />
            <Line dataKey="v" stroke={C.navy} strokeWidth={2} dot={{ r: 3, fill: C.navy, strokeWidth: 0 }} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            <ReferenceDot x={first.year} y={first.v} r={4} fill={C.navy} stroke="#fff" strokeWidth={2} label={{ value: pct(first.v), position: "bottom", style: labelStyle() }} />
            <ReferenceDot x={last.year} y={last.v} r={4} fill={C.navy} stroke="#fff" strokeWidth={2} label={{ value: pct(last.v), position: "top", style: labelStyle() }} />
          </LineChart>
        )}
      </ChartBox>
    </>
  );
}

// ============================================================================ C10
export function C10({ data }: { data: { sector: string; value: number; color: string }[] }) {
  return (
    <ChartBox height={HALF}>
      {(w) => (
        <BarChart width={w} height={HALF} data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} barSize={Math.min(40, barSize(w, data.length, 0.5))}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="sector" interval={0} height={40} axisLine={axisLine} tickLine={false}
            tick={({ x, y, payload }: any) => <MultiTick x={x} y={y} lines={String(payload.value).split(" ")} />} />
          <YAxis domain={[0, 20]} ticks={[0, 5, 10, 15, 20]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} width={34} />
          <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
            <TipBox title={`${payload[0].payload.sector}, Q3 2026`} source={payload[0].payload.sector === "Office" ? "CBRE" : payload[0].payload.sector === "Industrial" ? "Cushman & Wakefield" : payload[0].payload.sector === "Malls" ? "Colliers" : "Cushman & Wakefield"} rows={[{ name: "Vacancy", value: pct(payload[0].payload.value) }]} />) : null} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.sector} fill={C[(d.color as ColorName) ?? "navy"]} />)}
            <LabelList dataKey="value" content={({ x, y, width, value }: any) => <Lbl x={x + width / 2} y={y - 5} text={pct(value)} />} />
          </Bar>
        </BarChart>
      )}
    </ChartBox>
  );
}

// ============================================================================ C11
export function C11({ data }: { data: { market: string; value: number }[] }) {
  return (
    <>
      <LegendRow items={[{ label: "Texas metro", color: "teal" }, { label: "U.S. reference", color: "grey" }]} />
      <ChartBox height={HALF}>
        {(w) => (
          <BarChart width={w} height={HALF} data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 4 }} barSize={22}>
            <CartesianGrid stroke={C.light} horizontal={false} />
            <XAxis type="number" domain={[0, 30]} ticks={[0, 10, 20, 30]} tickFormatter={(v) => `${v}%`} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
            <YAxis type="category" dataKey="market" tick={({ x, y, payload }: any) => <text x={x} y={y + 4} textAnchor="end" style={{ fontSize: 11, fill: C.dark }}>{payload.value}</text>} axisLine={false} tickLine={false} width={72} />
            <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
              <TipBox title={`${payload[0].payload.market}, Sep 2026`} source="Yardi Matrix" rows={[{ name: "Office vacancy", value: pct(payload[0].payload.value) }]} />) : null} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.market} fill={d.market.startsWith("U.S") ? C.grey : C.teal} />)}
              <LabelList dataKey="value" content={({ x, y, width, height, value }: any) => <Lbl x={x + width + 6} y={y + height / 2 + 4} text={pct(value)} anchor="start" />} />
            </Bar>
          </BarChart>
        )}
      </ChartBox>
    </>
  );
}

// ============================================================================ C12
const METROS: { key: string; name: string; short: string; color: ColorName }[] = [
  { key: "dfw", name: "Dallas–FW", short: "DFW", color: "navy" },
  { key: "hou", name: "Houston", short: "Houston", color: "teal" },
  { key: "aus", name: "Austin", short: "Austin", color: "orange" },
  { key: "sat", name: "San Antonio", short: "San Antonio", color: "purple" },
];

export function C12({ data }: { data: Record<string, number>[] }) {
  const last = data[data.length - 1];
  const H = FULL + 20;
  const margin = { top: 14, right: 124, bottom: 0, left: 0 };
  const xAxisH = 30;
  const max = 80000;
  return (
    <>
      <LegendRow items={METROS.map((m) => ({ label: m.name, color: m.color, kind: "line" as const }))} />
      <ChartBox height={H}>
        {(w) => {
          const narrow = w < NARROW;
          const plotH = H - margin.top - margin.bottom - xAxisH;
          const ypx = (v: number) => margin.top + (1 - v / max) * plotH;
          const dy = spreadLabels(METROS.map((m) => ({ key: m.key, y: ypx(last[m.key]) })), 13, margin.top, margin.top + plotH);
          return (
            <LineChart width={w} height={H} data={data} margin={margin}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" type="number" domain={[2006, 2025]} padding={{ left: 8, right: 0 }} ticks={yearTicks(narrow)} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} height={xAxisH} />
              <YAxis domain={[0, max]} ticks={[0, 20000, 40000, 60000, 80000]} tickFormatter={(v) => compact(v, 0)} tick={tick} axisLine={false} tickLine={false} width={36} />
              <Tooltip cursor={lineCursor} content={({ active, payload, label }: any) => active && payload?.length ? (
                <TipBox title={`${label} permits (units)`} source="Census via FRED (NSA)" rows={METROS.map((m) => ({ name: m.name, value: int(payload[0].payload[m.key]), color: m.color }))} />) : null} />
              {METROS.map((m) => (
                <Line key={m.key} dataKey={m.key} stroke={C[m.color]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false}>
                  <LabelList dataKey={m.key} content={({ x, y, index, value }: any) => {
                    if (index !== data.length - 1) return null;
                    const off = dy[m.key] ?? 0;
                    return (
                      <g>
                        <circle cx={x} cy={y} r={4} fill={C[m.color]} stroke="#fff" strokeWidth={2} />
                        {Math.abs(off) > 1 && <line x1={x + 5} y1={y} x2={x + 12} y2={y + off} stroke={C.muted} strokeWidth={1} />}
                        <Lbl x={x + 14} y={y + off + 4} text={`${m.short} ${compact(value)}`} anchor="start" />
                      </g>
                    );
                  }} />
                </Line>
              ))}
            </LineChart>
          );
        }}
      </ChartBox>
    </>
  );
}

// ============================================================================ C13
export function C13({ data }: { data: { name: string; key: string; pct: number }[] }) {
  const color = (k: string): string => (k === "tx" ? C.grey : C[METROS.find((m) => m.key === k)?.color ?? "navy"]);
  return (
    <ChartBox height={HALF}>
      {(w) => (
        <BarChart width={w} height={HALF} data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 4 }} barSize={18}>
          <CartesianGrid stroke={C.light} horizontal={false} />
          <XAxis type="number" domain={[-25, 10]} ticks={[-20, -10, 0, 10]} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={({ x, y, payload }: any) => <text x={x} y={y + 4} textAnchor="end" style={{ fontSize: 11, fill: C.dark }}>{payload.value}</text>} axisLine={false} tickLine={false} width={84} />
          <ReferenceLine x={0} stroke={C.dark} strokeWidth={1} />
          <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
            <TipBox title={`${payload[0].payload.name}, Jan–Sep 2026 vs. 2025`} source="Census via FRED (NSA)" rows={[{ name: "Permit change", value: `${signed(payload[0].payload.pct)}%` }]} />) : null} />
          <Bar dataKey="pct" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.key} fill={color(d.key)} />)}
            <LabelList dataKey="pct" content={({ x, y, width, height, value }: any) => {
              const neg = value < 0;
              const endX = neg ? x + Math.min(0, width) : x + width;
              return <Lbl x={neg ? endX - 5 : endX + 5} y={y + height / 2 + 4} text={`${signed(value)}%`} anchor={neg ? "end" : "start"} />;
            }} />
          </Bar>
        </BarChart>
      )}
    </ChartBox>
  );
}

// ============================================================================ C14
export function C14({ data }: { data: { metro: string; key: string; rent: number; yy: number }[] }) {
  return (
    <ChartBox height={HALF}>
      {(w) => (
        <BarChart width={w} height={HALF} data={data} margin={{ top: 32, right: 4, bottom: 0, left: 0 }} barSize={Math.min(40, barSize(w, data.length, 0.45))}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="metro" interval={0} height={40} axisLine={axisLine} tickLine={false}
            tick={({ x, y, payload }: any) => <MultiTick x={x} y={y} lines={String(payload.value).replace("Dallas–FW", "Dallas–FW").split(" ")} />} />
          <YAxis domain={[0, 1600]} ticks={[0, 400, 800, 1200, 1600]} tickFormatter={(v) => `$${v.toLocaleString("en-US")}`} tick={tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
            <TipBox title={`${payload[0].payload.metro}, Oct 2026`} source="Apartment List Rent Index" rows={[
              { name: "Median rent", value: `$${int(payload[0].payload.rent)}` }, { name: "Change y/y", value: `${signed(payload[0].payload.yy)}%` }]} />) : null} />
          <Bar dataKey="rent" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.key} fill={C[METROS.find((m) => m.key === d.key)?.color ?? "navy"]} />)}
            <LabelList dataKey="rent" content={({ x, y, width, index }: any) => {
              const d = data[index];
              const cx = x + width / 2;
              return (
                <text x={cx} y={y - 19} textAnchor="middle" style={labelStyle()}>
                  <tspan x={cx}>${int(d.rent)}</tspan>
                  <tspan x={cx} dy={13} style={{ fontWeight: 400 }}>{signed(d.yy)}%</tspan>
                </text>
              );
            }} />
          </Bar>
        </BarChart>
      )}
    </ChartBox>
  );
}

// ============================================================================ C15
export function C15({ data }: { data: { year: number; permits: number; unemp: number }[] }) {
  const last = data[data.length - 1];
  const peak = data.reduce((a, b) => (b.unemp > a.unemp ? b : a));
  return (
    <>
      <LegendRow items={[{ label: "U.S. building permits, thousands (left axis)", color: "grey" }, { label: "Unemployment rate (right axis)", color: "orange", kind: "line" }]} />
      <ChartBox height={FULL}>
        {(w) => (
          <ComposedChart width={w} height={FULL} data={data} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" ticks={yearTicks(w < NARROW)} interval={0} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
            <YAxis yAxisId="p" domain={[0, 2000]} ticks={[0, 500, 1000, 1500, 2000]} tickFormatter={(v) => `${v.toLocaleString("en-US")}K`} tick={tick} axisLine={false} tickLine={false} width={46} />
            <YAxis yAxisId="u" orientation="right" domain={[0, 10]} ticks={[0, 2.5, 5, 7.5, 10]} tickFormatter={(v) => `${v}%`} tick={tick} axisLine={false} tickLine={false} width={38} />
            <Tooltip cursor={tipCursor} content={({ active, payload, label }: any) => active && payload?.length ? (
              <TipBox title={String(label)} source="Census; BLS via FRED" rows={[
                { name: "Permits", value: `${int(payload[0].payload.permits * 1000)} units`, color: "grey" },
                { name: "Unemployment", value: pct(payload[0].payload.unemp, 2), color: "orange" }]} />) : null} />
            <Bar yAxisId="p" dataKey="permits" fill={C.grey} radius={[4, 4, 0, 0]} barSize={barSize(w, data.length, 0.62)} isAnimationActive={false}>
              <LabelList dataKey="permits" content={({ x, y, width, index }: any) =>
                index === data.length - 1 ? <Lbl x={x + width} y={y - 6} text={`${(last.permits / 1000).toFixed(2)}M`} anchor="end" /> : null} />
            </Bar>
            <Line yAxisId="u" dataKey="unemp" stroke={C.orange} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            <ReferenceDot yAxisId="u" x={peak.year} y={peak.unemp} r={4} fill={C.orange} stroke="#fff" strokeWidth={2} label={{ value: `${pct(peak.unemp)} (${peak.year})`, position: "top", style: labelStyle() }} />
            <ReferenceDot yAxisId="u" x={last.year} y={last.unemp} r={4} fill={C.orange} stroke="#fff" strokeWidth={2} label={{ value: pct(last.unemp), position: "left", style: labelStyle() }} />
          </ComposedChart>
        )}
      </ChartBox>
    </>
  );
}

// ============================================================================ C16
export function C16({ data }: { data: { market: string; months: number; year_ago: number }[] }) {
  const H = 44 + data.length * 34;
  return (
    <>
      <LegendRow items={[{ label: "Latest months of inventory", color: "teal" }, { label: "A year ago", color: "orange", kind: "tick" }, { label: "4.5–6 months: commonly cited “balanced” range", color: "light" }]} />
      <ChartBox height={H}>
        {(w) => {
          const narrow = w < NARROW;
          return (
            <ComposedChart width={w} height={H} data={data} layout="vertical" margin={{ top: narrow ? 34 : 24, right: 36, bottom: 0, left: 4 }} barGap={-16} barSize={16}>
              <CartesianGrid stroke={C.light} horizontal={false} />
              <ReferenceArea x1={4.5} x2={6} fill={C.light} fillOpacity={1} ifOverflow="hidden"
                label={(p: any) => {
                  const vb = p.viewBox;
                  const cx = vb.x + vb.width / 2;
                  return (
                    <text x={cx} y={vb.y - (narrow ? 20 : 8)} textAnchor="middle" style={{ ...halo, fontSize: 10, fill: C.muted }}>
                      {narrow ? (<><tspan x={cx}>commonly cited</tspan><tspan x={cx} dy={13}>“balanced” range</tspan></>) : "commonly cited “balanced” range"}
                    </text>
                  );
                }} />
              <XAxis type="number" domain={[0, 8]} ticks={[0, 2, 4, 6, 8]} tick={tick} tickMargin={7} axisLine={axisLine} tickLine={false} />
              <YAxis type="category" dataKey="market" axisLine={false} tickLine={false} width={84}
                tick={({ x, y, payload }: any) => {
                  const m = String(payload.value).match(/^(.*?)\s*(\(.*\))?$/)!;
                  return (
                    <text x={x - 2} y={y - 2} textAnchor="end" style={{ fontSize: 11 }}>
                      <tspan x={x - 2} fill={C.dark}>{m[1]}</tspan>
                      {m[2] && <tspan x={x - 2} dy={13} fill={C.muted}>{m[2]}</tspan>}
                    </text>
                  );
                }} />
              <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
                <TipBox title={payload[0].payload.market} source="NAR, Texas Realtors, MetroTex, HAR, Unlock MLS, SABOR" rows={[
                  { name: "Months of inventory", value: String(payload[0].payload.months), color: "teal" },
                  { name: "A year ago", value: String(payload[0].payload.year_ago), color: "orange" }]} />) : null} />
              <Bar dataKey="months" fill={C.teal} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="months" content={({ x, y, width, height, index }: any) => {
                  const d = data[index];
                  const pxPer = width / d.months;
                  const end = x + Math.max(d.months, d.year_ago) * pxPer;
                  return <Lbl x={end + 7} y={y + height / 2 + 4} text={String(d.months)} anchor="start" />;
                }} />
              </Bar>
              <Bar dataKey="year_ago" fill="transparent" isAnimationActive={false}
                shape={(p: any) => <rect x={p.x + p.width - 1.5} y={p.y - 3} width={3} height={p.height + 6} rx={1.5} fill={C.orange} />} />
            </ComposedChart>
          );
        }}
      </ChartBox>
    </>
  );
}

// ============================================================================ C17
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[12px] font-semibold text-dark">{title}</p>
      {children}
    </div>
  );
}

export function C17({ data }: { data: { year: number; label: string; yc: number; vix: number; dollar: number | null }[] }) {
  const last = data[data.length - 1];
  const vixPeak = data.reduce((a, b) => (b.vix > a.vix ? b : a));
  const dollar = data.filter((d) => d.dollar != null);
  const dLast = dollar[dollar.length - 1];
  const ticks = [2006, 2016, 2026];
  const yr = (y: number) => String(y);
  const H = 180;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title="Yield curve, 10-yr minus 2-yr (pts)">
        <LegendRow items={[{ label: "Positive", color: "teal" }, { label: "Inverted (below zero)", color: "bad" }]} />
        <ChartBox height={H}>
          {(w) => (
            <BarChart width={w} height={H} data={data} margin={{ top: 18, right: 16, bottom: 0, left: 0 }} barSize={barSize(w, data.length, 0.6)}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" ticks={ticks} interval={0} tickFormatter={yr} tick={tick} tickMargin={7} axisLine={false} tickLine={false} />
              <YAxis domain={[-1, 3]} ticks={[-1, 0, 1, 2, 3]} tick={tick} axisLine={false} tickLine={false} width={26} />
              <ReferenceLine y={0} stroke={C.dark} strokeWidth={1} />
              <Tooltip cursor={tipCursor} content={({ active, payload }: any) => active && payload?.length ? (
                <TipBox title={`${payload[0].payload.label} average`} source="FRED T10Y2Y" rows={[{ name: "10-yr minus 2-yr", value: `${signed(payload[0].payload.yc, 2)} pts` }]} />) : null} />
              <Bar dataKey="yc" isAnimationActive={false}>
                {data.map((d) => <Cell key={d.year} fill={d.yc < 0 ? C.bad : C.teal} />)}
                <LabelList dataKey="yc" content={({ x, y, width, index }: any) => index === data.length - 1 ? <Lbl x={x + width} y={y - 6} text={`${signed(last.yc, 2)}`} anchor="end" /> : null} />
              </Bar>
            </BarChart>
          )}
        </ChartBox>
      </Panel>
      <Panel title="VIX volatility index">
        <LegendRow items={[{ label: "20–30", color: "amber" }, { label: "30+", color: "bad" }]} />
        <ChartBox height={H}>
          {(w) => (
            <LineChart width={w} height={H} data={data} margin={{ top: 18, right: 34, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <ReferenceArea y1={20} y2={30} fill={C.amber} fillOpacity={0.12} ifOverflow="hidden" />
              <ReferenceArea y1={30} y2={40} fill={C.bad} fillOpacity={0.1} ifOverflow="hidden" />
              <XAxis dataKey="year" type="number" domain={[2006, 2026]} padding={{ left: 8, right: 0 }} ticks={ticks} tickFormatter={yr} tick={tick} tickMargin={7} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 40]} ticks={[0, 10, 20, 30, 40]} tick={tick} axisLine={false} tickLine={false} width={26} />
              <Tooltip cursor={lineCursor} content={({ active, payload }: any) => active && payload?.length ? (
                <TipBox title={`${payload[0].payload.label} average`} source="Cboe via FRED (VIXCLS)" rows={[{ name: "VIX", value: payload[0].payload.vix.toFixed(2) }]} />) : null} />
              <Line dataKey="vix" stroke={C.navy} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              <ReferenceDot x={vixPeak.year} y={vixPeak.vix} r={4} fill={C.navy} stroke="#fff" strokeWidth={2} label={{ value: `${vixPeak.vix.toFixed(1)} (${vixPeak.year})`, position: "top", style: labelStyle() }} />
              <ReferenceDot x={last.year} y={last.vix} r={4} fill={C.navy} stroke="#fff" strokeWidth={2} label={{ value: last.vix.toFixed(1), position: "right", style: labelStyle() }} />
            </LineChart>
          )}
        </ChartBox>
      </Panel>
      <Panel title="Fed broad dollar index (26 currencies)">
        <LegendRow items={[{ label: "Annual average, 2006–2025", color: "teal", kind: "line" }]} />
        <ChartBox height={H}>
          {(w) => (
            <LineChart width={w} height={H} data={dollar} margin={{ top: 18, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" type="number" domain={[2006, 2025]} padding={{ left: 8, right: 0 }} ticks={[2006, 2015, 2025]} tick={tick} tickMargin={7} axisLine={false} tickLine={false} />
              <YAxis domain={[80, 130]} ticks={[80, 90, 100, 110, 120, 130]} tick={tick} axisLine={false} tickLine={false} width={30} />
              <Tooltip cursor={lineCursor} content={({ active, payload }: any) => active && payload?.length ? (
                <TipBox title={`${payload[0].payload.label} average`} source="Federal Reserve via FRED (DTWEXBGS)" rows={[{ name: "Broad index", value: payload[0].payload.dollar.toFixed(2) }]} />) : null} />
              <Line dataKey="dollar" stroke={C.teal} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              <ReferenceDot x={dLast.year} y={dLast.dollar!} r={4} fill={C.teal} stroke="#fff" strokeWidth={2} label={{ value: dLast.dollar!.toFixed(1), position: "right", style: labelStyle() }} />
            </LineChart>
          )}
        </ChartBox>
      </Panel>
    </div>
  );
}

// ============================================================================ registry
const REGISTRY: Record<string, (p: { data: any }) => React.ReactElement> = {
  C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17,
};

export function ChartRenderer({ id, data }: { id: string; data: unknown }) {
  const Comp = REGISTRY[id];
  return Comp ? <Comp data={data} /> : null;
}
