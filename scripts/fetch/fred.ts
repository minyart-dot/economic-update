// FRED client and metric computations (spec 11.1).
//
// Every AUTO metric in data/config/metrics.yaml with a `fred:` id is computed here:
//   level metrics   latest observation and the year-ago observation, scaled to the metrics.yaml unit
//   cpi_yoy etc.    12-month % change computed from the index levels
//   fed_funds       target range from DFEDTARL / DFEDTARU; value = midpoint
//   permits_*_ytd   sum of the NSA months January..latest vs the same months a year earlier
// Year-ago values are re-pulled on every run (spec 11.4). FRED "." is null and never filled.

import type { MetricConfig } from "../../lib/types";
import { fetchJson, HttpError, type HttpOptions } from "./http";
import { addDays, addMonths, clean, findYearAgo, labelOf, latestObs, monthLabel, periodOf } from "./periods";
import type { Computed, Obs, SaveRaw, SeriesFrequency } from "./types";

export const FRED_API = "https://api.stlouisfed.org/fred/series/observations";
export const fredSeriesUrl = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

/**
 * Multiplier from FRED's native units to the metrics.yaml unit, where they differ.
 * (CCSA is persons -> millions; JTSJOL, PERMIT, HOUST are thousands -> millions; PERMIT1 thousands -> count.)
 */
export const FRED_SCALE: Record<string, number> = {
  CCSA: 1e-6,
  JTSJOL: 1e-3,
  PERMIT: 1e-3,
  PERMITNSA: 1e-3,
  HOUST: 1e-3,
  PERMIT1: 1e3,
};

/** Metrics that are derived from their series rather than read directly. */
export const FRED_DERIVED: Record<string, "yoy" | "range" | "ytd"> = {
  cpi_yoy: "yoy",
  core_cpi_yoy: "yoy",
  energy_cpi_yoy: "yoy",
  fed_funds: "range",
  permits_texas_ytd: "ytd",
};

/** Texas metro permits for tables.metros (spec 11.1), emitted under auto.json `extras`. */
export const FRED_METRO_PERMITS: Record<string, string> = {
  permits_ytd_dallas_fw: "DALL148BPPRIV",
  permits_ytd_houston: "HOUS448BPPRIV",
  permits_ytd_austin: "AUST448BPPRIV",
  permits_ytd_san_antonio: "SANA748BPPRIV",
};

interface FredResponse {
  observations?: { date: string; value: string }[];
  error_code?: number;
  error_message?: string;
}

/** FRED observations JSON to Obs[] ("." and blanks become null). */
export function parseFredObservations(json: unknown): Obs[] {
  const r = json as FredResponse;
  if (!r || !Array.isArray(r.observations)) {
    throw new Error(r?.error_message ? `FRED error: ${r.error_message}` : "FRED response has no observations");
  }
  return r.observations
    .map((o) => {
      const n = o.value === "." || o.value?.trim() === "" ? NaN : Number(o.value);
      return { date: o.date, value: Number.isFinite(n) ? n : null };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type SeriesGetter = (seriesId: string) => Promise<Obs[]>;

/**
 * Returns a cached getter that pulls each series once per run from FRED.
 * Observations run from three years before the edition to the end of the edition month.
 */
export function fredClient(opts: {
  apiKey: string | undefined;
  edition: string;
  http?: HttpOptions;
  saveRaw?: SaveRaw;
}): SeriesGetter {
  const cache = new Map<string, Promise<Obs[]>>();
  const start = `${Number(opts.edition.slice(0, 4)) - 3}-01-01`;
  const end = addDays(addMonths(`${opts.edition}-01`, 1), -1);
  return (id) => {
    if (!cache.has(id)) {
      cache.set(
        id,
        (async () => {
          if (!opts.apiKey) throw new Error("FRED_API_KEY is not set");
          const q = new URLSearchParams({
            series_id: id,
            api_key: opts.apiKey,
            file_type: "json",
            observation_start: start,
            observation_end: end,
          });
          let res;
          try {
            res = await fetchJson<FredResponse>(`${FRED_API}?${q}`, opts.http);
          } catch (e) {
            // FRED explains 400s (bad series id, bad key) in the body.
            const msg = e instanceof HttpError && e.body ? fredErrorMessage(e.body) : null;
            if (msg) throw new Error(`FRED ${id}: ${msg}`);
            throw e;
          }
          opts.saveRaw?.(`fred/${id}.json`, res.raw);
          return parseFredObservations(res.data);
        })(),
      );
    }
    return cache.get(id)!;
  };
}

function fredErrorMessage(body: string): string | null {
  try {
    return (JSON.parse(body) as FredResponse).error_message ?? null;
  } catch {
    return null;
  }
}

function asSeriesFreq(f: string): SeriesFrequency {
  if (f === "daily" || f === "weekly" || f === "monthly" || f === "quarterly") return f;
  throw new Error(`Unsupported frequency for FRED metric: ${f}`);
}

/** Latest observation and its year-ago match, scaled. */
export function computeLevel(obs: Obs[], freq: SeriesFrequency, scale = 1): Computed {
  const last = latestObs(obs);
  if (!last) throw new Error("no observations with a value");
  const ya = findYearAgo(obs, last.date, freq);
  return {
    value: clean(last.value! * scale),
    period: periodOf(last.date, freq),
    period_label: labelOf(last.date, freq),
    year_ago: ya ? clean(ya.value! * scale) : null,
    year_ago_period: ya ? periodOf(ya.date, freq) : null,
    as_of: periodOf(last.date, freq),
  };
}

/** 12-month % change series from a monthly index (only where both months exist). */
export function yoySeries(index: Obs[]): Obs[] {
  const byDate = new Map(index.map((o) => [o.date, o.value]));
  return index.map((o) => {
    const prev = byDate.get(addMonths(o.date, -12));
    const value = o.value !== null && prev != null && prev !== 0 ? (o.value / prev - 1) * 100 : null;
    return { date: o.date, value };
  });
}

/** CPI-style y/y: latest computable 12-month change (1 decimal, as BLS publishes) and the one a year earlier. */
export function computeYoy(index: Obs[]): Computed {
  const yoy = yoySeries(index).map((o) => ({ date: o.date, value: o.value === null ? null : clean(o.value, 1) }));
  return computeLevel(yoy, "monthly");
}

const fmtRate = (x: number) => x.toFixed(2);

/** Fed funds target range: value = midpoint, display "3.75–4.00%". */
export function computeFedRange(lower: Obs[], upper: Obs[]): Computed {
  const up = new Map(upper.map((o) => [o.date, o.value]));
  const mid: Obs[] = [];
  const range = new Map<string, [number, number]>();
  for (const o of lower) {
    const u = up.get(o.date);
    if (o.value === null || u == null) {
      mid.push({ date: o.date, value: null });
      continue;
    }
    range.set(o.date, [o.value, u]);
    mid.push({ date: o.date, value: (o.value + u) / 2 });
  }
  const c = computeLevel(mid, "daily");
  const last = latestObs(mid)!;
  const [l, u] = range.get(last.date)!;
  const out: Computed = { ...c, display: `${fmtRate(l)}–${fmtRate(u)}%` };
  const ya = findYearAgo(mid, last.date, "daily");
  if (ya) {
    const [yl, yu] = range.get(ya.date)!;
    out.year_ago_display = `${fmtRate(yl)}–${fmtRate(yu)}%`;
  }
  return out;
}

/**
 * Year-to-date sum of a monthly NSA series: January..latest month vs the same months a year earlier.
 * A missing month inside the current range is an error (a partial sum would be wrong); a missing
 * month in the prior-year range makes year_ago null.
 */
export function computeYtd(obs: Obs[]): Computed {
  const last = latestObs(obs);
  if (!last) throw new Error("no observations with a value");
  const year = Number(last.date.slice(0, 4));
  const month = Number(last.date.slice(5, 7));
  const sum = (y: number): number | null => {
    let total = 0;
    for (let m = 1; m <= month; m++) {
      const d = `${y}-${String(m).padStart(2, "0")}-01`;
      const v = obs.find((o) => o.date === d)?.value;
      if (v == null) return null;
      total += v;
    }
    return total;
  };
  const cur = sum(year);
  if (cur === null) throw new Error(`missing month in ${year} year-to-date range`);
  const prev = sum(year - 1);
  const mm = String(month).padStart(2, "0");
  const label = month === 1 ? "Jan" : `Jan–${monthLabel(last.date)}`;
  return {
    value: clean(cur),
    period: `${year}-01/${year}-${mm}`,
    period_label: label,
    year_ago: prev === null ? null : clean(prev),
    year_ago_period: prev === null ? null : `${year - 1}-01/${year - 1}-${mm}`,
    as_of: `${year}-${mm}`,
  };
}

export const fredIds = (cfg: MetricConfig): string[] => (cfg.fred === undefined ? [] : [cfg.fred].flat());

/** Computes one metrics.yaml metric from FRED. Throws on any failure (the caller marks it stale). */
export async function computeFredMetric(
  id: string,
  cfg: MetricConfig,
  get: SeriesGetter,
): Promise<Computed & { source_url: string }> {
  const ids = fredIds(cfg);
  if (!ids.length) throw new Error(`${id} has no fred series id`);
  const kind = FRED_DERIVED[id];
  if (kind === "range") {
    const lowerId = ids.find((s) => s.endsWith("L")) ?? ids[0];
    const upperId = ids.find((s) => s.endsWith("U")) ?? ids[1];
    const [l, u] = await Promise.all([get(lowerId), get(upperId)]);
    return { ...computeFedRange(l, u), source_url: fredSeriesUrl(upperId) };
  }
  const series = ids[0];
  const obs = await get(series);
  const url = fredSeriesUrl(series);
  if (kind === "yoy") return { ...computeYoy(obs), source_url: url };
  if (kind === "ytd") return { ...computeYtd(obs), source_url: url };
  return { ...computeLevel(obs, asSeriesFreq(cfg.frequency), FRED_SCALE[series] ?? 1), source_url: url };
}
