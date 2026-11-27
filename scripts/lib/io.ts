// File access for the data pipeline (build-edition, validate-edition, manual template).
// Every loader takes a repository root so tests can point it at tests/fixtures/.
// lib/data.ts stays the loader for the website (always process.cwd()).

import fs from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { EditionSeed, MetricsFile, SourceEntry } from "../../lib/types";

export const EDITION_ID = /^\d{4}-\d{2}$/;

export function dataPath(root: string, ...rel: string[]): string {
  return path.join(root, "data", ...rel);
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function readYaml<T>(file: string): T {
  return yamlLoad(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export const loadMetricsConfigAt = (root: string) => readYaml<MetricsFile>(dataPath(root, "config", "metrics.yaml"));

export function loadSourcesAt(root: string): SourceEntry[] {
  const file = dataPath(root, "config", "sources.yaml");
  if (!fs.existsSync(file)) return [];
  return readYaml<{ sources: SourceEntry[] }>(file).sources ?? [];
}

export function listEditionsAt(root: string): string[] {
  const dir = dataPath(root, "editions");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export const editionFile = (root: string, id: string) => dataPath(root, "editions", `${id}.json`);

export function loadEditionAt(root: string, id: string): EditionSeed {
  return readJson<EditionSeed>(editionFile(root, id));
}

/** The newest edition strictly before `id`, or null. */
export function previousEditionId(root: string, id: string): string | null {
  return listEditionsAt(root).filter((e) => e < id).at(-1) ?? null;
}

// ---------------------------------------------------------------- agent A's auto.json contract

export interface AutoMetric {
  value: number | null;
  period: string;
  period_label: string;
  year_ago: number | null;
  year_ago_period?: string | null;
  as_of: string;
  source_url?: string;
  stale?: boolean;
  error?: string | null;
}

export interface AutoFile {
  generated_at: string;
  edition: string;
  metrics: Record<string, AutoMetric>;
}

export const autoFile = (root: string, id: string) => dataPath(root, "raw", id, "auto.json");

export function loadAutoAt(root: string, id: string): AutoFile | null {
  const f = autoFile(root, id);
  return fs.existsSync(f) ? readJson<AutoFile>(f) : null;
}

/** An auto value is usable when the fetcher returned a fresh number without an error. */
export function autoUsable(a: AutoMetric | undefined): boolean {
  return !!a && !a.stale && !a.error && a.value != null;
}

// ---------------------------------------------------------------- data/manual/YYYY-MM.yaml

export interface ManualEntry {
  label?: string;
  required?: boolean;
  stale?: boolean;
  value?: number | null;
  display?: string;
  period?: string;
  period_label?: string;
  year_ago?: number | null;
  year_ago_display?: string;
  year_ago_period?: string;
  change_reported?: { pct?: number; points?: number; approx?: boolean };
  as_of?: string;
  source_url?: string;
  source_name?: string;
  notes?: string | null;
  footnote?: string | null;
  expected_release?: string;
  carry_forward?: boolean;
  carry_forward_reason?: string;
}

export interface ManualFile {
  edition?: string;
  metrics: Record<string, ManualEntry>;
}

export const manualFile = (root: string, id: string) => dataPath(root, "manual", `${id}.yaml`);

export function loadManualAt(root: string, id: string): ManualFile | null {
  const f = manualFile(root, id);
  if (!fs.existsSync(f)) return null;
  const m = readYaml<ManualFile | null>(f);
  return { ...(m ?? {}), metrics: m?.metrics ?? {} };
}

// ---------------------------------------------------------------- dates

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-12" -> "December 2026" */
export function editionLabel(id: string): string {
  const [y, m] = id.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "2026-11-20" -> "Nov 20, 2026" */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * The last calendar day an "as of" / period string covers, as a UTC date.
 * Accepts 2026-11-19, 2026-10, 2026-Q3, 2026-H1, 2026 and ranges like 2026-01/2026-09 (uses the end).
 */
export function periodEnd(p: string | null | undefined): Date | null {
  if (!p) return null;
  const s = String(p).split("/").at(-1)!.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if ((m = s.match(/^(\d{4})-(\d{2})$/))) return new Date(Date.UTC(+m[1], +m[2], 0));
  if ((m = s.match(/^(\d{4})-Q([1-4])$/))) return new Date(Date.UTC(+m[1], +m[2] * 3, 0));
  if ((m = s.match(/^(\d{4})-H([12])$/))) return new Date(Date.UTC(+m[1], +m[2] * 6, 0));
  if ((m = s.match(/^(\d{4})$/))) return new Date(Date.UTC(+m[1], 12, 0));
  return null;
}

export const DAY_MS = 86_400_000;
