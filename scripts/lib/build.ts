// Edition builder (spec Sections 10–11): previous edition (structure and text) + data/raw/YYYY-MM/auto.json
// + data/manual/YYYY-MM.yaml -> a draft edition with every metric record frozen per spec 10.2.
// Direction, color and changes come from lib/edition.ts enrichMetrics (lib/compare.ts); nothing is
// recomputed here. Narrative text is copied from the previous edition and listed as NEEDS REVIEW.

import fs from "node:fs";
import path from "node:path";
import { buildAlert } from "../../lib/alert";
import { computeCorrelations, type TexasAnnual, type UsAnnual } from "../../lib/analytics";
import { enrichMetrics } from "../../lib/edition";
import { formatValue } from "../../lib/format";
import type { EditionSeed, Metric, MetricSeed, MetricsFile } from "../../lib/types";
import {
  autoUsable,
  dataPath,
  dateLabel,
  editionLabel,
  listEditionsAt,
  loadAutoAt,
  loadEditionAt,
  loadManualAt,
  loadMetricsConfigAt,
  manualFile,
  previousEditionId,
  readJson,
  type AutoMetric,
  type ManualEntry,
} from "./io";

export type ValueSource = "auto" | "manual" | "carried_forward" | "stale";

export interface BuildOptions {
  root: string;
  id: string;
  /** Draft mode: stale required values become warnings instead of errors (for the preview PR). */
  draft?: boolean;
  now?: Date;
}

export interface BuildResult {
  ok: boolean;
  edition: EditionSeed | null;
  baseEdition: string | null;
  errors: string[];
  warnings: string[];
  needsReview: string[];
  sources: Record<string, ValueSource>;
}

/** Keys the builder computes and freezes; stripped from the previous edition before merging. */
const COMPUTED_KEYS = [
  "id", "label", "unit", "change_abs", "change_pct", "direction", "polarity", "color",
  "comparison_basis", "source_name", "automation", "frequency", "stale", "carried_forward",
  "carry_forward_reason",
] as const;

function stripComputed(m: MetricSeed | undefined, cfg: MetricsFile["metrics"][string]): MetricSeed {
  const out: Record<string, unknown> = { ...(m ?? { value: null, period: "", period_label: "", year_ago: null }) };
  for (const k of COMPUTED_KEYS) delete out[k];
  // A source_name equal to the config default was frozen, not an override.
  if (m?.source_name && m.source_name !== cfg.source_name) out.source_name = m.source_name;
  // Same for display texts that equal the standard format: keep only real overrides.
  if (m && m.display === formatValue(m.value, cfg)) delete out.display;
  if (m && m.year_ago != null && m.year_ago_display === formatValue(m.year_ago, cfg)) delete out.year_ago_display;
  return out as unknown as MetricSeed;
}

interface Update {
  value: number | null;
  period: string;
  period_label: string;
  year_ago: number | null;
  year_ago_period?: string | null;
  as_of?: string;
  source_url?: string;
  source_name?: string;
  display?: string;
  year_ago_display?: string;
  change_reported?: MetricSeed["change_reported"];
  notes?: string | null;
  footnote?: string | null;
}

const fromAuto = (a: AutoMetric): Update => ({
  value: a.value,
  period: a.period,
  period_label: a.period_label,
  year_ago: a.year_ago ?? null,
  year_ago_period: a.year_ago_period ?? null,
  as_of: a.as_of,
  source_url: a.source_url,
});

function fromManual(m: ManualEntry): Update {
  const u: Update = {
    value: m.value ?? null,
    period: String(m.period ?? ""),
    period_label: String(m.period_label ?? ""),
    year_ago: m.year_ago ?? null,
    year_ago_period: m.year_ago_period ? String(m.year_ago_period) : null,
    as_of: m.as_of ? String(m.as_of) : undefined,
    source_url: m.source_url || undefined,
    source_name: m.source_name || undefined,
  };
  if (m.display) u.display = m.display;
  if (m.year_ago_display) u.year_ago_display = m.year_ago_display;
  if (m.change_reported) u.change_reported = m.change_reported;
  if (m.notes !== undefined) u.notes = m.notes || null;
  if (m.footnote !== undefined) u.footnote = m.footnote || null;
  return u;
}

/** Merge a fresh value into the previous record, dropping text that described the old period. */
function applyUpdate(id: string, base: MetricSeed, u: Update, review: string[]): MetricSeed {
  const out: MetricSeed = { ...base };
  const periodChanged = u.period !== base.period;
  if (periodChanged) {
    if (out.display !== undefined && u.display === undefined) {
      review.push(`metrics.${id}: display text "${out.display}" described ${base.period}; removed (standard format used). Add "display" if needed.`);
    }
    if (out.year_ago_display !== undefined && u.year_ago_display === undefined && u.year_ago != null) {
      review.push(`metrics.${id}: year-ago display "${out.year_ago_display}" removed (new period).`);
    }
    if (out.year_ago_footnote_mark && out.footnote && u.footnote === undefined) {
      review.push(`metrics.${id}: footnote removed; it explained the previous year-ago substitution: "${out.footnote}"`);
      delete out.footnote;
    }
    for (const k of ["display", "year_ago_label", "year_ago_footnote_mark", "year_ago_revised", "change_reported"] as const) {
      delete out[k];
    }
    if (u.year_ago != null) delete out.year_ago_display;
  } else {
    if (u.value !== base.value && out.display !== undefined && u.display === undefined) {
      review.push(`metrics.${id}: value revised ${base.value} -> ${u.value}; old display "${out.display}" removed.`);
      delete out.display;
    }
    if (u.year_ago !== base.year_ago && out.year_ago_display !== undefined && u.year_ago_display === undefined) {
      delete out.year_ago_display;
    }
  }
  // Spec 11.4: the year-ago value is re-pulled each run; mark it "(rev.)" when the same period changed.
  if (
    base.year_ago != null && u.year_ago != null && u.year_ago !== base.year_ago &&
    (u.year_ago_period ?? null) === (base.year_ago_period ?? null)
  ) {
    out.year_ago_revised = true;
    review.push(`metrics.${id}: year-ago value revised ${base.year_ago} -> ${u.year_ago} (marked rev.).`);
  }
  if (periodChanged && u.notes === undefined && base.notes) {
    review.push(`metrics.${id}: notes copied from ${base.period}: "${base.notes}"`);
  }
  if (periodChanged && u.footnote === undefined && out.footnote) {
    review.push(`metrics.${id}: footnote copied from ${base.period}: "${out.footnote}"`);
  }

  out.value = u.value;
  out.period = u.period;
  out.period_label = u.period_label;
  out.year_ago = u.year_ago;
  if (u.year_ago_period) out.year_ago_period = u.year_ago_period;
  else delete out.year_ago_period;
  out.as_of = u.as_of || u.period;
  if (u.source_url) out.source_url = u.source_url;
  if (u.source_name) out.source_name = u.source_name;
  if (u.display !== undefined) out.display = u.display;
  if (u.year_ago_display !== undefined) out.year_ago_display = u.year_ago_display;
  if (u.change_reported !== undefined) out.change_reported = u.change_reported;
  if (u.year_ago != null) delete out.change_reported; // the level takes precedence (lib/compare.ts)
  if (u.notes !== undefined) out.notes = u.notes;
  if (u.footnote !== undefined) out.footnote = u.footnote;
  return out;
}

/** Spec 10.2 record: inputs plus the frozen computed fields, in the documented order. */
function freeze(seed: MetricSeed, m: Metric, flags: Partial<MetricSeed>): MetricSeed {
  const rec: Record<string, unknown> = {
    id: m.id,
    label: m.label,
    value: m.value,
    display: m.display,
    period: m.period,
    period_label: m.period_label,
    year_ago: m.year_ago,
    year_ago_period: m.year_ago_period,
  };
  // Optional inputs that shape the display, kept only when present in the seed.
  for (const k of ["year_ago_display", "year_ago_label", "year_ago_footnote_mark", "year_ago_revised", "change_reported"] as const) {
    if (seed[k] !== undefined) rec[k] = seed[k];
  }
  Object.assign(rec, {
    change_abs: m.change_abs,
    change_pct: m.change_pct,
    direction: m.direction,
    polarity: m.polarity,
    color: m.color,
    comparison_basis: m.comparison_basis,
    ref_2019: m.ref_2019,
    source_name: m.source_name,
    source_url: m.source_url,
    as_of: m.as_of,
    automation: m.automation,
    frequency: m.frequency,
    unit: m.unit,
    footnote: m.footnote,
    notes: m.notes,
    ...flags,
  });
  return rec as unknown as MetricSeed;
}

/** Narrative and table text that the pipeline cannot regenerate (copied, never fabricated). */
function textReviewList(e: EditionSeed, prevId: string): string[] {
  const out = [
    `headline_summary, month_in_brief, big_picture: copied from ${prevId}; rewrite for this month (or use the draft summary).`,
    `themes: ${e.themes.length} themes / ${e.themes.reduce((n, t) => n + t.bullets.length, 0)} bullets copied from ${prevId}.`,
    `asset_cards: ${e.asset_cards.reduce((n, a) => n + a.bullets.length, 0)} bullets copied from ${prevId}.`,
    `tiles.*.sub: sub-lines copied from ${prevId} (they quote year-ago values and periods).`,
  ];
  for (const [sid, sec] of Object.entries(e.sections ?? {})) {
    const groups = Object.entries(sec as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v) && (v as unknown[]).some((b) => typeof b === "object" && b && "text" in b))
      .map(([k, v]) => `${k} (${(v as unknown[]).length})`);
    const other = Object.keys(sec as Record<string, unknown>).filter((k) => !groups.some((g) => g.startsWith(k + " ")));
    out.push(`sections.${sid}: ${[...groups, ...other.map((k) => `${k} (values/text)`)].join(", ")} copied from ${prevId}.`);
  }
  out.push(`notes: ${Object.keys(e.notes).join(", ")} copied from ${prevId}.`);
  out.push(`next_month and tables.release_calendar: copied from ${prevId}; update the dates.`);
  out.push(`tables.inventory, tables.metros, tables.gauge_explainer: copied from ${prevId}.`);
  out.push(`tables.reference_levels.today: copied from ${prevId}; check against the new values.`);
  return out;
}

function loadHistory(root: string): { us: UsAnnual; tx: TexasAnnual } | null {
  const us = dataPath(root, "history", "us_annual.json");
  const tx = dataPath(root, "history", "texas_annual.json");
  if (!fs.existsSync(us) || !fs.existsSync(tx)) return null;
  return { us: readJson<UsAnnual>(us), tx: readJson<TexasAnnual>(tx) };
}

export function buildEdition(opts: BuildOptions): BuildResult {
  const { root, id, draft = false } = opts;
  const now = opts.now ?? new Date();
  const errors: string[] = [];
  const warnings: string[] = [];
  const review: string[] = [];
  const sources: Record<string, ValueSource> = {};
  const fail = (): BuildResult => ({ ok: false, edition: null, baseEdition: null, errors, warnings, needsReview: review, sources });

  // Structure comes from the previous edition. With none (the first edition), rebuild from the
  // edition itself so the AUTO values can be compared against a fresh pull.
  let baseId = previousEditionId(root, id);
  if (!baseId && listEditionsAt(root).includes(id)) {
    baseId = id;
    warnings.push(`No edition before ${id}; using ${id} itself as the structure (rebuild mode).`);
  }
  if (!baseId) {
    errors.push(`No previous edition found in data/editions/ to copy the structure from.`);
    return fail();
  }
  const prev = loadEditionAt(root, baseId);
  const cfg = loadMetricsConfigAt(root);
  const auto = loadAutoAt(root, id);
  const manual = loadManualAt(root, id);

  if (!auto) warnings.push(`data/raw/${id}/auto.json not found; AUTO metrics need manual entries or stay stale.`);
  if (auto && auto.edition && auto.edition !== id) errors.push(`auto.json says edition ${auto.edition}, expected ${id}.`);
  if (!manual) {
    const msg = `${path.relative(root, manualFile(root, id))} not found. Run: npm run manual-template -- ${id}`;
    if (draft) warnings.push(msg + " (draft mode: manual values kept from the previous edition, marked stale).");
    else {
      errors.push(msg);
      return fail();
    }
  }
  for (const mid of Object.keys(manual?.metrics ?? {})) {
    if (!cfg.metrics[mid]) errors.push(`data/manual/${id}.yaml has "${mid}", which is not in data/config/metrics.yaml.`);
  }

  const ids = Object.keys(prev.metrics);
  // Metrics new this month (in the config, not in the previous edition) join when they have a fresh value.
  for (const mid of Object.keys(auto?.metrics ?? {})) {
    if (!ids.includes(mid) && cfg.metrics[mid] && autoUsable(auto!.metrics[mid])) ids.push(mid);
  }
  for (const [mid, m] of Object.entries(manual?.metrics ?? {})) {
    if (!ids.includes(mid) && cfg.metrics[mid] && m.stale === false) ids.push(mid);
  }

  const seeds: Record<string, MetricSeed> = {};
  const flags: Record<string, Partial<MetricSeed>> = {};
  for (const mid of ids) {
    const c = cfg.metrics[mid];
    if (!c) {
      errors.push(`Metric "${mid}" is in ${baseId} but not in data/config/metrics.yaml.`);
      continue;
    }
    const base = stripComputed(prev.metrics[mid], c);
    const man = manual?.metrics[mid];
    const a = auto?.metrics[mid];

    if (man && man.stale === false) {
      if (man.value == null && man.value !== base.value) warnings.push(`${mid}: manual entry has value null (shows "—").`);
      if (!man.period) errors.push(`${mid}: manual entry is marked stale: false but has no period.`);
      seeds[mid] = applyUpdate(mid, base, fromManual(man), review);
      sources[mid] = "manual";
      continue;
    }
    if (a && autoUsable(a)) {
      seeds[mid] = applyUpdate(mid, base, fromAuto(a), review);
      sources[mid] = "auto";
      continue;
    }

    // Not refreshed: keep the previous record with its original as_of.
    seeds[mid] = { ...base, as_of: base.as_of ?? base.period };
    const reason = man?.carry_forward_reason?.trim();
    if (man?.carry_forward && reason) {
      flags[mid] = { carried_forward: true, carry_forward_reason: reason };
      sources[mid] = "carried_forward";
      continue;
    }
    sources[mid] = "stale";
    flags[mid] = { stale: true };
    const why = a?.error ? ` (fetch error: ${a.error})` : a?.stale ? " (fetcher returned stale)" : "";
    if (man?.carry_forward && !reason) {
      const msg = `${mid}: carry_forward is true but carry_forward_reason is empty in data/manual/${id}.yaml.`;
      if (c.required && !draft) errors.push(msg);
      else warnings.push(msg);
    } else if (c.required) {
      const msg =
        `${mid} (${c.label}) is required and still stale${why}. In data/manual/${id}.yaml enter the new value ` +
        `and set stale: false, or set carry_forward: true with a carry_forward_reason. Source: ${man?.source_url ?? c.source_url}`;
      if (draft) warnings.push(msg + " [draft mode: kept previous value]");
      else errors.push(msg);
    } else {
      warnings.push(`${mid}: not refreshed${why}; previous value kept with its original as-of ${seeds[mid].as_of}.`);
    }
  }
  if (errors.length) return fail();

  let enriched: Record<string, Metric>;
  try {
    enriched = enrichMetrics({ metrics: seeds } as EditionSeed, cfg);
  } catch (e) {
    errors.push((e as Error).message);
    return fail();
  }
  const metrics: Record<string, MetricSeed> = {};
  for (const mid of Object.keys(seeds)) metrics[mid] = freeze(seeds[mid], enriched[mid], flags[mid] ?? {});

  // Key-indicator cells are plain data: regenerate them for metrics whose numbers changed.
  const keyIndicators = prev.tables.key_indicators.map((row) => {
    const before = prev.metrics[row.metric];
    const m = enriched[row.metric];
    if (!m || !before || (before.value === m.value && before.year_ago === m.year_ago && before.period === m.period)) return row;
    review.push(`tables.key_indicators.${row.metric}: latest/year-ago cells regenerated from the new values.`);
    return {
      ...row,
      latest: m.period_label ? `${m.display} (${m.period_label})` : m.display,
      year_ago: m.year_ago_display ?? "—",
      ref_2019: m.ref_2019 ?? row.ref_2019,
    };
  });

  const nowIso = now.toISOString();
  const asOf = (auto?.generated_at ?? nowIso).slice(0, 10);
  const history = loadHistory(root);
  const vix = enriched.vix;

  const edition: EditionSeed & Record<string, unknown> = {
    ...prev,
    edition: id,
    edition_label: editionLabel(id),
    status: "draft",
    published_at: nowIso.slice(0, 10),
    data_as_of: asOf,
    data_as_of_label: dateLabel(asOf),
    metrics,
    tables: { ...prev.tables, key_indicators: keyIndicators },
  };
  delete edition.newsletter_sent_at;
  delete edition.references;
  if (history) edition.correlations = computeCorrelations(history.us, history.tx);
  if (vix?.value != null) edition.alert = buildAlert(vix.value, vix.period_label, enriched.yield_curve?.value ?? null);

  const needsReview = [...textReviewList(prev, baseId), ...review];
  edition.build = {
    built_at: nowIso,
    previous_edition: baseId,
    auto_generated_at: auto?.generated_at ?? null,
    manual_file: manual ? `data/manual/${id}.yaml` : null,
    draft_mode: draft,
    needs_review: needsReview,
  };

  return { ok: true, edition, baseEdition: baseId, errors, warnings, needsReview, sources };
}
