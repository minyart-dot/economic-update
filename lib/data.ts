// File loaders for /data (server-only; runs at build time for static generation).

import fs from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { EditionSeed, MetricsFile, SectionConfig, SourceEntry } from "./types";
import type { TexasAnnual, UsAnnual } from "./analytics";

const DATA = path.join(process.cwd(), "data");

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")) as T;
}
function readYaml<T>(rel: string): T {
  return yamlLoad(fs.readFileSync(path.join(DATA, rel), "utf8")) as T;
}

export const loadMetricsConfig = () => readYaml<MetricsFile>("config/metrics.yaml");
export const loadSections = () => readYaml<{ sections: SectionConfig[] }>("config/sections.yaml").sections;
export const loadSources = () => readYaml<{ sources: SourceEntry[] }>("config/sources.yaml").sources;
export const loadUsAnnual = () => readJson<UsAnnual>("history/us_annual.json");
export const loadTexasAnnual = () => readJson<TexasAnnual>("history/texas_annual.json");

export interface ChallengerHistory {
  challenger_job_cuts: { years: string[]; total: number[]; ai_cited: number[] };
  ai_cited_cuts_monthly: Record<string, (number | null)[] | number>;
}
export interface GaugesHistory {
  years_2006_2026ytd: number[];
  yield_curve_10y2y_annual_avg_2006_2026ytd: number[];
  vix_annual_avg_2006_2026ytd: number[];
  broad_dollar_annual_avg_2006_2025: number[];
}
export const loadChallenger = () => readJson<ChallengerHistory>("history/challenger.json");
export const loadGauges = () => readJson<GaugesHistory>("history/gauges.json");

/** Every long series the charts and correlations use. */
export interface HistoryBundle {
  us: UsAnnual;
  tx: TexasAnnual;
  challenger: ChallengerHistory;
  gauges: GaugesHistory;
}

export const historySnapshotPath = (id: string) => path.join(DATA, "editions", `${id}.history.json`);

export function loadLiveHistory(): HistoryBundle {
  return { us: loadUsAnnual(), tx: loadTexasAnnual(), challenger: loadChallenger(), gauges: loadGauges() };
}

/**
 * History as it was when the edition was published (data/editions/YYYY-MM.history.json),
 * so archived editions never change when /data/history is appended (spec 17: archive pages stay
 * unchanged). Editions without a snapshot (drafts, the month being prepared) use the live files.
 */
export function historyFor(id: string): { history: HistoryBundle; snapshot: boolean } {
  const p = historySnapshotPath(id);
  if (fs.existsSync(p)) {
    const snap = JSON.parse(fs.readFileSync(p, "utf8"));
    return { history: snap.history as HistoryBundle, snapshot: true };
  }
  return { history: loadLiveHistory(), snapshot: false };
}

/** Writes the snapshot for an edition. Refuses to overwrite unless force is set. */
export function freezeHistory(id: string, force = false): boolean {
  const p = historySnapshotPath(id);
  if (fs.existsSync(p) && !force) return false;
  const body = {
    _notes: `Snapshot of data/history/* taken when edition ${id} was published, so its charts and correlations stay as published. Do not edit.`,
    edition: id,
    frozen_at: new Date().toISOString(),
    history: loadLiveHistory(),
  };
  fs.writeFileSync(p, JSON.stringify(body, null, 1) + "\n");
  return true;
}

export function listEditions(): string[] {
  return fs
    .readdirSync(path.join(DATA, "editions"))
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadEditionSeed(id: string): EditionSeed {
  return readJson<EditionSeed>(`editions/${id}.json`);
}

/** "ready" (approved, email pending) and "published" editions are public; "draft" is not. */
export function isPublic(id: string): boolean {
  return loadEditionSeed(id).status !== "draft";
}

export function publicEditions(): string[] {
  return listEditions().filter(isPublic);
}

export function latestEditionId(): string {
  const pub = publicEditions();
  return (pub.length ? pub : listEditions()).at(-1)!;
}
