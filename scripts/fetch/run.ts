// Runs every fetcher for an edition and assembles data/raw/YYYY-MM/auto.json.
//
// Failure handling (spec 12.4): a failed metric keeps the value from the most recent edition in
// data/editions/ with stale: true and the error message; the run itself never fails.

import fs from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { MetricConfig, MetricsFile } from "../../lib/types";
import { APARTMENTLIST_SOURCE_URL, computeRent, defaultApartmentListUrl, fetchApartmentList, RENT_LOCATIONS } from "./apartmentlist";
import { computeEurostatMetric, EUROSTAT_METRICS, EUROSTAT_SOURCE_URL, fetchEurostat, type JsonStat } from "./eurostat";
import { computeFredMetric, computeYtd, fredClient, fredIds, fredSeriesUrl, FRED_METRO_PERMITS } from "./fred";
import { redact, type HttpOptions } from "./http";
import { fetchKastle, KASTLE_SOURCE_URL, kastleRefDate } from "./kastle";
import { defaultNyfedUrl, expectedQuarter, fetchNyfed, nyfedReportUrl } from "./nyfed";
import type { AutoFile, AutoRecord, Computed, Obs, SaveRaw } from "./types";

export interface RunOptions {
  edition: string;
  /** Folder holding config/ and editions/. Default: ./data */
  dataDir?: string;
  /** Default: <dataDir>/editions */
  editionsDir?: string;
  /** Where auto.json and raw responses go. Default: <dataDir>/raw/<edition> */
  outDir?: string;
  env?: Record<string, string | undefined>;
  http?: HttpOptions;
  now?: Date;
  /** false = compute only, write nothing. Default true. */
  write?: boolean;
}

export function toRecord(c: Computed, sourceUrl: string): AutoRecord {
  const r: AutoRecord = {
    value: c.value,
    period: c.period,
    period_label: c.period_label,
    year_ago: c.year_ago,
    year_ago_period: c.year_ago === null ? null : c.year_ago_period,
    as_of: c.as_of,
    source_url: sourceUrl,
    stale: false,
    error: null,
  };
  if (c.display !== undefined) r.display = c.display;
  if (c.year_ago_display !== undefined) r.year_ago_display = c.year_ago_display;
  return r;
}

const errMsg = (e: unknown) => redact(e instanceof Error ? e.message : String(e));

/** Edition ids in `dir` up to and including `edition`, newest first. */
function editionsUpTo(dir: string, edition: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 7))
    .filter((id) => id <= edition)
    .sort()
    .reverse();
}

/** The last published value for a metric, marked stale (spec 12.4). Value null if no edition has it. */
export function staleRecord(
  metricId: string,
  error: string,
  opts: { editionsDir: string; edition: string; defaultUrl: string },
): AutoRecord {
  for (const id of editionsUpTo(opts.editionsDir, opts.edition)) {
    const seed = JSON.parse(fs.readFileSync(path.join(opts.editionsDir, `${id}.json`), "utf8")) as {
      metrics?: Record<string, Record<string, unknown>>;
    };
    const m = seed.metrics?.[metricId];
    if (!m) continue;
    const yearAgo = (m.year_ago as number | null | undefined) ?? null;
    const r: AutoRecord = {
      value: (m.value as number | null | undefined) ?? null,
      period: String(m.period ?? ""),
      period_label: String(m.period_label ?? ""),
      year_ago: yearAgo,
      year_ago_period: yearAgo === null ? null : ((m.year_ago_period as string | undefined) ?? null),
      as_of: String(m.as_of ?? m.period ?? ""),
      source_url: (m.source_url as string | undefined) ?? opts.defaultUrl,
      stale: true,
      error,
    };
    if (typeof m.display === "string") r.display = m.display;
    if (typeof m.year_ago_display === "string") r.year_ago_display = m.year_ago_display;
    return r;
  }
  return {
    value: null,
    period: "",
    period_label: "",
    year_ago: null,
    year_ago_period: null,
    as_of: "",
    source_url: opts.defaultUrl,
    stale: true,
    error,
  };
}

export async function runFetch(o: RunOptions): Promise<AutoFile> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.edition)) throw new Error(`Edition must be YYYY-MM, got "${o.edition}"`);
  const dataDir = o.dataDir ?? path.join(process.cwd(), "data");
  const editionsDir = o.editionsDir ?? path.join(dataDir, "editions");
  const outDir = o.outDir ?? path.join(dataDir, "raw", o.edition);
  const env = o.env ?? process.env;
  const write = o.write ?? true;
  const config = yamlLoad(fs.readFileSync(path.join(dataDir, "config", "metrics.yaml"), "utf8")) as MetricsFile;

  const saveRaw: SaveRaw | undefined = write
    ? (rel, body) => {
        const file = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, body);
      }
    : undefined;

  const fred = fredClient({ apiKey: env.FRED_API_KEY, edition: o.edition, http: o.http, saveRaw });
  let eurostat: Promise<JsonStat> | null = null;
  const getEurostat = () => (eurostat ??= fetchEurostat(o.edition, o.http, saveRaw));
  let rents: Promise<Record<string, Obs[]>> | null = null;
  const rentUrl = env.APARTMENTLIST_CSV_URL || defaultApartmentListUrl(o.edition);
  const getRents = () => (rents ??= fetchApartmentList(rentUrl, o.http, saveRaw));
  const rentSeries = async (id: string) => {
    const s = (await getRents())[id];
    if (!s) throw new Error(`Apartment List CSV has no row for ${id}`);
    return s;
  };

  type Job = () => Promise<AutoRecord>;
  const jobFor = (id: string, cfg: MetricConfig): Job | null => {
    if (cfg.automation === "AUTO" && fredIds(cfg).length) {
      return async () => {
        const c = await computeFredMetric(id, cfg, fred);
        return toRecord(c, c.source_url);
      };
    }
    if (id in EUROSTAT_METRICS) return async () => toRecord(computeEurostatMetric(await getEurostat(), id), EUROSTAT_SOURCE_URL);
    if (id in RENT_LOCATIONS) return async () => toRecord(computeRent(await rentSeries(id)), APARTMENTLIST_SOURCE_URL);
    // ---- Kastle + NY Fed (SEMI, best effort): any doubt throws -> stale record -> manual template.
    if (id === "office_occupancy_kastle") {
      const url = env.KASTLE_URL || KASTLE_SOURCE_URL;
      return async () => toRecord(await fetchKastle(url, kastleRefDate(o.edition, o.now ?? new Date()), o.http, saveRaw), KASTLE_SOURCE_URL);
    }
    if (id === "hh_debt_delinquent") {
      const url = env.NYFED_HHDC_URL || defaultNyfedUrl(o.edition);
      return async () => toRecord(await fetchNyfed(url, o.edition, o.http, saveRaw), nyfedReportUrl(expectedQuarter(o.edition)));
    }
    // ---- end Kastle + NY Fed
    return null;
  };

  const fallback = (id: string, error: string, defaultUrl: string) =>
    staleRecord(id, error, { editionsDir, edition: o.edition, defaultUrl });
  const guard = async (id: string, job: Job, defaultUrl: string): Promise<AutoRecord> => {
    try {
      return await job();
    } catch (e) {
      return fallback(id, errMsg(e), defaultUrl);
    }
  };

  const metricEntries = await Promise.all(
    Object.entries(config.metrics).map(async ([id, cfg]): Promise<[string, AutoRecord] | null> => {
      const job = jobFor(id, cfg);
      if (job) return [id, await guard(id, job, cfg.source_url)];
      // AUTO metrics without a fetcher are reported (stale) so the gap shows up in the PR.
      if (cfg.automation === "AUTO") return [id, fallback(id, "No automated fetcher for this metric yet; enter it manually", cfg.source_url)];
      return null;
    }),
  );

  const extraJobs: [string, Job, string][] = [
    ...Object.entries(FRED_METRO_PERMITS).map(([id, series]): [string, Job, string] => [
      id,
      async () => toRecord(computeYtd(await fred(series)), fredSeriesUrl(series)),
      fredSeriesUrl(series),
    ]),
    ...Object.keys(RENT_LOCATIONS)
      .filter((id) => !(id in config.metrics))
      .map((id): [string, Job, string] => [
        id,
        async () => toRecord(computeRent(await rentSeries(id)), APARTMENTLIST_SOURCE_URL),
        APARTMENTLIST_SOURCE_URL,
      ]),
  ];
  const extraEntries = await Promise.all(
    extraJobs.map(async ([id, job, url]): Promise<[string, AutoRecord]> => [id, await guard(id, job, url)]),
  );

  const out: AutoFile = {
    generated_at: (o.now ?? new Date()).toISOString(),
    edition: o.edition,
    metrics: Object.fromEntries(metricEntries.filter((e): e is [string, AutoRecord] => e !== null)),
    extras: Object.fromEntries(extraEntries),
  };
  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "auto.json"), JSON.stringify(out, null, 2) + "\n");
  }
  return out;
}
