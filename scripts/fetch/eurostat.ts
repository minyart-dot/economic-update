// Eurostat unemployment (dataset une_rt_m, JSON-stat 2.0 dissemination API), spec 11.1.
//
//   euro_unemployment       euro area, total, % of labour force, seasonally adjusted
//   eu_youth_unemployment   EU-27, under 25, % of labour force, seasonally adjusted
//
// Written against the documented JSON-stat 2.0 response format
// (https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/api-statistics);
// the live endpoint could not be reached from the build environment, so parsing is isolated in
// parseJsonStatSeries() and covered by fixture tests.

import { fetchJson, type HttpOptions } from "./http";
import { computeLevel } from "./fred";
import type { Computed, Obs, SaveRaw } from "./types";

export const EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m";
export const EUROSTAT_SOURCE_URL = "https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table";

/** Euro-area geo codes, newest composition first (Bulgaria joined in 2026). The first one present is used. */
const EURO_AREA_CODES = ["EA21", "EA20", "EA"];

export const EUROSTAT_METRICS: Record<string, { geo: string[]; age: string }> = {
  euro_unemployment: { geo: EURO_AREA_CODES, age: "TOTAL" },
  eu_youth_unemployment: { geo: ["EU27_2020"], age: "Y_LT25" },
};

interface JsonStatDimension {
  category: { index: Record<string, number> | string[] };
}
export interface JsonStat {
  id: string[];
  size: number[];
  dimension: Record<string, JsonStatDimension>;
  value: Record<string, number | null> | (number | null)[];
}

function categoryIndex(dim: JsonStatDimension): Record<string, number> {
  const idx = dim.category.index;
  return Array.isArray(idx) ? Object.fromEntries(idx.map((c, i) => [c, i])) : idx;
}

/** "2026-09" or "2026M09" to "2026-09-01". */
function timeToDate(code: string): string | null {
  const m = /^(\d{4})(?:-|M)(\d{2})$/.exec(code);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/**
 * Pulls one monthly series out of a JSON-stat 2.0 dataset. `select` fixes every dimension except
 * `time` (dimensions of size 1 may be omitted). Missing cells are null.
 */
export function parseJsonStatSeries(ds: JsonStat, select: Record<string, string>): Obs[] {
  if (!ds?.id || !ds.size || !ds.dimension) throw new Error("Eurostat response is not JSON-stat 2.0");
  const timeDim = ds.id.indexOf("time");
  if (timeDim < 0) throw new Error("Eurostat response has no time dimension");
  const fixed = ds.id.map((dim, i) => {
    if (i === timeDim) return 0;
    const idx = categoryIndex(ds.dimension[dim]);
    const code = select[dim];
    if (code === undefined) {
      if (ds.size[i] === 1) return 0;
      throw new Error(`no selection for Eurostat dimension ${dim}`);
    }
    if (idx[code] === undefined) throw new Error(`Eurostat ${dim}=${code} not in response`);
    return idx[code];
  });
  const times = Object.entries(categoryIndex(ds.dimension.time)).sort((a, b) => a[1] - b[1]);
  const out: Obs[] = [];
  for (const [code, t] of times) {
    const date = timeToDate(code);
    if (!date) continue;
    const pos = [...fixed];
    pos[timeDim] = t;
    let flat = 0;
    for (let i = 0; i < pos.length; i++) flat = flat * ds.size[i] + pos[i];
    const raw = Array.isArray(ds.value) ? ds.value[flat] : ds.value[String(flat)];
    out.push({ date, value: typeof raw === "number" ? raw : null });
  }
  return out;
}

/** The first geo code of `candidates` the dataset contains. */
export function pickGeo(ds: JsonStat, candidates: string[]): string {
  const idx = categoryIndex(ds.dimension.geo);
  const hit = candidates.find((c) => idx[c] !== undefined);
  if (!hit) throw new Error(`none of ${candidates.join(", ")} in Eurostat response`);
  return hit;
}

export function computeEurostatMetric(ds: JsonStat, metricId: string): Computed {
  const spec = EUROSTAT_METRICS[metricId];
  const obs = parseJsonStatSeries(ds, {
    freq: "M",
    s_adj: "SA",
    unit: "PC_ACT",
    sex: "T",
    age: spec.age,
    geo: pickGeo(ds, spec.geo),
  });
  return computeLevel(obs, "monthly");
}

export async function fetchEurostat(edition: string, http?: HttpOptions, saveRaw?: SaveRaw): Promise<JsonStat> {
  const q = new URLSearchParams({
    format: "JSON",
    lang: "EN",
    unit: "PC_ACT",
    s_adj: "SA",
    sex: "T",
    sinceTimePeriod: `${Number(edition.slice(0, 4)) - 2}-01`,
  });
  q.append("age", "TOTAL");
  q.append("age", "Y_LT25");
  const { data, raw } = await fetchJson<JsonStat>(`${EUROSTAT_API}?${q}`, http);
  saveRaw?.("eurostat/une_rt_m.json", raw);
  return data;
}
