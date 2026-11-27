// BLS Public Data API v2 client (fallback source for payrolls_change, spec 11.1 / 12.4).
//
// Request (documented at https://www.bls.gov/developers/api_signature_v2.htm): POST JSON to
//   https://api.bls.gov/publicAPI/v2/timeseries/data/
//   { "seriesid": ["CES0000000001"], "startyear": "2024", "endyear": "2026", "registrationkey": "..." }
// registrationkey is optional (BLS_API_KEY); without it the API answers at the lower unregistered limits.
// BLS_API_BASE overrides the endpoint (tests use a local stand-in).
//
// Response (documented format; not confirmed live from the build environment, which cannot reach BLS):
//   { "status": "REQUEST_SUCCEEDED", "message": [...],
//     "Results": { "series": [ { "seriesID": "...", "data": [
//        { "year": "2026", "period": "M10", "periodName": "October", "latest": "true", "value": "159671",
//          "footnotes": [{ "code": "P", "text": "preliminary" }] }, ... ] } ] } }
// Data run newest first; M13 is an annual average (skipped); "-" or blank means no value (null, never filled).

import { fetchText, type FetchImpl, type HttpOptions } from "./http";
import type { Obs, SaveRaw } from "./types";

export const BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
export const blsApiUrl = () => process.env.BLS_API_BASE || BLS_API;
export const blsSeriesUrl = (id: string) => `https://data.bls.gov/timeseries/${id}`;

interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: { series?: { seriesID?: string; data?: { year: string; period: string; value: string }[] }[] };
}

/** BLS v2 JSON to monthly Obs[] (oldest first) for one series. Throws on a non-success status or no data. */
export function parseBlsSeries(json: unknown, seriesId: string): Obs[] {
  const r = json as BlsResponse;
  const msg = Array.isArray(r?.message) ? r.message.filter(Boolean).join(" ") : "";
  if (!r || r.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS ${seriesId}: ${r?.status ?? "no status"}${msg ? ` (${msg})` : ""}`);
  }
  const series = r.Results?.series?.find((s) => s.seriesID === seriesId);
  if (!series || !Array.isArray(series.data) || !series.data.length) {
    throw new Error(`BLS ${seriesId}: no data${msg ? ` (${msg})` : ""}`);
  }
  const byDate = new Map<string, number | null>();
  for (const d of series.data) {
    const m = /^M(0[1-9]|1[0-2])$/.exec(d.period ?? "");
    if (!m || !/^\d{4}$/.test(d.year ?? "")) continue;
    const raw = String(d.value ?? "").replace(/,/g, "").trim();
    const n = raw === "" || raw === "-" ? NaN : Number(raw);
    byDate.set(`${d.year}-${m[1]}-01`, Number.isFinite(n) ? n : null);
  }
  if (!byDate.size) throw new Error(`BLS ${seriesId}: no monthly observations`);
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

type PostInit = { signal?: AbortSignal; headers?: Record<string, string>; method: string; body: string };

/** Fetches one BLS series for startYear..endYear. Retries, timeouts and redaction come from fetchText. */
export async function fetchBlsSeries(opts: {
  seriesId: string;
  startYear: number;
  endYear: number;
  apiKey?: string;
  http?: HttpOptions;
  saveRaw?: SaveRaw;
  apiBase?: string;
}): Promise<Obs[]> {
  const payload: Record<string, unknown> = {
    seriesid: [opts.seriesId],
    startyear: String(opts.startYear),
    endyear: String(opts.endYear),
  };
  if (opts.apiKey) payload.registrationkey = opts.apiKey;
  const body = JSON.stringify(payload);
  const base = (opts.http?.fetchImpl ?? globalThis.fetch) as unknown as (url: string, init: PostInit) => ReturnType<FetchImpl>;
  const post: FetchImpl = (url, init) => base(url, { ...init, method: "POST", body });
  const hide = (s: string) => (opts.apiKey ? s.split(opts.apiKey).join("REDACTED") : s);
  try {
    const raw = await fetchText(opts.apiBase || blsApiUrl(), {
      ...opts.http,
      headers: { ...opts.http?.headers, "Content-Type": "application/json" },
      fetchImpl: post,
    });
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`BLS ${opts.seriesId}: invalid JSON`);
    }
    opts.saveRaw?.(`bls/${opts.seriesId}.json`, raw);
    return parseBlsSeries(json, opts.seriesId);
  } catch (e) {
    throw new Error(hide(e instanceof Error ? e.message : String(e)));
  }
}
