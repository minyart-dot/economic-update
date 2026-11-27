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

export function latestEditionId(): string {
  const all = listEditions();
  const published = all.filter((id) => loadEditionSeed(id).status === "published");
  return (published.length ? published : all).at(-1)!;
}
