// UK unemployment (spec 11.1: "ONS API (series MGSX) | AUTO").
//
//   uk_unemployment   ONS series MGSX: unemployment rate, UK, aged 16 and over, seasonally adjusted, %
//                     (Labour Market Statistics dataset LMS)
//
// Written against the documented ONS time-series JSON shape (the `/data` suffix on a time-series page):
//   { "description": {...}, "years": [...], "quarters": [...],
//     "months": [{ "date": "2026 JUL-SEP", "value": "4.6", "year": "2026", "month": "...", ... }, ...] }
// Values are strings. The ONS host could not be reached from the build environment (proxy 403),
// so parsing is isolated in parseOnsMonths() and covered by synthetic fixture tests.
//
// Period semantics. MGSX "monthly" values are rolling 3-month averages from the Labour Force Survey:
// "2026 JUL-SEP" is the average of July, August and September 2026. ONS labels a window by the
// year of its first month, so "2025 NOV-JAN" is Nov 2025 to Jan 2026. We use the latest window
// and record it by its END month: period "2026-09", period_label "Jul–Sep", so the label shows
// the whole window and no reader takes it for a single-month reading. The year-ago value is the
// same 3-month window one year earlier ("2025 JUL-SEP", period "2025-09"), which is the y/y basis
// of spec 5.1. Jul–Sep is calendar Q3, so the November 2026 edition's hand-entered
// "2026-Q3" / "Q3" (4.6%) describes the same reading as "2026-09" / "Jul–Sep"; for windows that are
// not calendar quarters (e.g. Aug–Oct) only the 3-month label is correct, so we always use it.

import { fetchJson, type HttpOptions } from "./http";
import { clean } from "./periods";
import type { Computed, SaveRaw } from "./types";

export const ONS_MGSX_API = "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms/data";
export const ONS_MGSX_SOURCE_URL = "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms";

export const ONS_METRICS: Record<string, { url: string; sourceUrl: string; raw: string }> = {
  uk_unemployment: { url: ONS_MGSX_API, sourceUrl: ONS_MGSX_SOURCE_URL, raw: "ons/mgsx.json" },
};

export interface OnsObservation {
  date: string;
  value: string | number | null;
  [k: string]: unknown;
}
export interface OnsTimeSeries {
  months?: OnsObservation[];
  quarters?: OnsObservation[];
  years?: OnsObservation[];
  [k: string]: unknown;
}

/** One rolling window: start/end are first-of-month dates (YYYY-MM-DD). */
export interface OnsWindow {
  start: string;
  end: string;
  value: number | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-01`;

/**
 * "2026 JUL-SEP" to { start: "2026-07-01", end: "2026-09-01" }; "2025 NOV-JAN" ends in January 2026.
 * A single month ("2026 SEP") is a one-month window. Returns null for anything else.
 */
export function parseOnsDate(date: string): { start: string; end: string } | null {
  const m = /^\s*(\d{4})\s+([A-Za-z]{3})(?:\s*-\s*([A-Za-z]{3}))?\s*$/.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const a = MONTHS.indexOf(m[2].toUpperCase());
  const b = m[3] === undefined ? a : MONTHS.indexOf(m[3].toUpperCase());
  if (a < 0 || b < 0) return null;
  return { start: ym(year, a), end: ym(b < a ? year + 1 : year, b) };
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null; // "", "..", "x" etc. = not published
  return Number(s);
}

/**
 * The `months` array of an ONS time-series response as windows, oldest first. Unpublished values
 * are null (never filled in). Throws if the response has no months or its dates are not in
 * ascending order (which would mean the date convention above does not hold).
 */
export function parseOnsMonths(ts: OnsTimeSeries): OnsWindow[] {
  if (!ts || !Array.isArray(ts.months)) throw new Error("ONS response has no months array");
  const out: OnsWindow[] = [];
  for (const o of ts.months) {
    const w = parseOnsDate(String(o?.date ?? ""));
    if (!w) continue;
    const prev = out.at(-1);
    if (prev && w.end <= prev.end) throw new Error(`ONS months out of order at "${o.date}"`);
    out.push({ ...w, value: toNumber(o.value) });
  }
  if (!out.length) throw new Error("ONS response has no monthly observations");
  return out;
}

/** "Jul–Sep" for a 3-month window, "Sep" for a single month. */
export function windowLabel(w: { start: string; end: string }): string {
  const a = LABELS[Number(w.start.slice(5, 7)) - 1];
  const b = LABELS[Number(w.end.slice(5, 7)) - 1];
  return a === b ? b : `${a}–${b}`;
}

/** Latest window with a value, and the same window one year earlier (spec 5.1). */
export function computeOnsRolling(windows: OnsWindow[]): Computed {
  let last: OnsWindow | undefined;
  for (let i = windows.length - 1; i >= 0 && !last; i--) if (windows[i].value !== null) last = windows[i];
  if (!last) throw new Error("ONS series has no observations with a value");
  const target = `${Number(last.end.slice(0, 4)) - 1}${last.end.slice(4)}`;
  const ya = windows.find((w) => w.end === target && w.start.slice(5) === last.start.slice(5) && w.value !== null);
  const period = last.end.slice(0, 7);
  return {
    value: clean(last.value!),
    period,
    period_label: windowLabel(last),
    year_ago: ya ? clean(ya.value!) : null,
    year_ago_period: ya ? ya.end.slice(0, 7) : null,
    as_of: period,
  };
}

export function computeOnsMetric(ts: OnsTimeSeries): Computed {
  return computeOnsRolling(parseOnsMonths(ts));
}

export async function fetchOns(metricId: string, http?: HttpOptions, saveRaw?: SaveRaw): Promise<OnsTimeSeries> {
  const spec = ONS_METRICS[metricId];
  const { data, raw } = await fetchJson<OnsTimeSeries>(spec.url, http);
  saveRaw?.(spec.raw, raw);
  return data;
}
