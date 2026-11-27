// Shared types for configs, the edition seed and the enriched edition the page renders.

export type Polarity = "higher_is_good" | "lower_is_good" | "mixed";
export type Unit =
  | "pct"
  | "pts"
  | "usd"
  | "count"
  | "millions"
  | "thousands"
  | "index"
  | "months"
  | "days"
  | "usd_bn"
  | "ratio";
export type Automation = "AUTO" | "SEMI" | "MANUAL";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "snapshot";
export type Direction = "up" | "down" | "flat";
export type ChangeColor = "good" | "bad" | "neutral";
export type Tone = "teal" | "orange" | "navy";

export type FlatThreshold = { relative: number } | { points: number };

export interface MetricConfig {
  label: string;
  unit: Unit;
  decimals?: number;
  signed?: boolean;
  polarity: Polarity;
  flat_threshold?: FlatThreshold;
  automation: Automation;
  frequency: Frequency;
  fred?: string | string[];
  required?: boolean;
  source_name: string;
  source_url: string;
  max_age_days?: number;
  /** Optional typical edition-to-edition move; the validator warns on a change over 3× this. */
  typical_move?: number;
}

export interface MetricsFile {
  defaults: { max_age_days: Record<Frequency, number> };
  metrics: Record<string, MetricConfig>;
}

export interface SectionConfig {
  id: string;
  number: string;
  title: string;
  kicker: string;
  nav: string;
}

export interface SourceEntry {
  phrase: string;
  url: string;
}

/** A change the source reports when it does not publish the year-ago level. */
export interface ReportedChange {
  pct?: number;
  points?: number;
  approx?: boolean;
}

/** Computed fields frozen into the edition snapshot by scripts/build-edition.ts, plus pipeline flags. */
export interface FrozenMetricFields {
  id?: string;
  label?: string;
  unit?: Unit;
  change_abs?: number | null;
  change_pct?: number | null;
  direction?: Direction | null;
  polarity?: Polarity;
  color?: ChangeColor | null;
  comparison_basis?: string;
  automation?: Automation;
  frequency?: Frequency;
  /** Not refreshed this month (not required); kept from the previous edition with its original as_of. */
  stale?: boolean;
  /** The owner carried the previous value forward (spec 11.2); as_of stays the original date. */
  carried_forward?: boolean;
  carry_forward_reason?: string;
}

/**
 * Metric values as stored in data/editions/YYYY-MM.json. Hand-made seeds (2026-11) hold inputs only;
 * editions written by scripts/build-edition.ts also carry the frozen computed fields (spec 10.2).
 * lib/edition.ts always recomputes the computed fields from the inputs (never trusts the frozen copy);
 * scripts/validate-edition.ts fails an edition whose frozen fields disagree with that recomputation.
 */
export interface MetricSeed extends FrozenMetricFields {
  value: number | null;
  display?: string;
  period: string;
  period_label: string;
  year_ago: number | null;
  year_ago_display?: string;
  year_ago_period?: string;
  year_ago_label?: string;
  year_ago_revised?: boolean;
  year_ago_footnote_mark?: boolean;
  change_reported?: ReportedChange;
  ref_2019?: string;
  source_name?: string;
  source_url?: string;
  as_of?: string;
  footnote?: string | null;
  notes?: string | null;
}

/** Full metric record (spec Section 10.2), produced by lib/edition.ts. */
export interface Metric {
  id: string;
  label: string;
  unit: Unit;
  value: number | null;
  display: string;
  period: string;
  period_label: string;
  year_ago: number | null;
  year_ago_display: string | null;
  year_ago_period: string | null;
  change_abs: number | null;
  change_pct: number | null;
  direction: Direction | null;
  polarity: Polarity;
  color: ChangeColor | null;
  comparison_basis: "y/y";
  ref_2019: string | null;
  source_name: string;
  source_url: string;
  as_of: string;
  automation: Automation;
  frequency: Frequency;
  footnote: string | null;
  notes: string | null;
  year_ago_revised: boolean;
  change_reported: ReportedChange | null;
}

export interface Link {
  phrase: string;
  url: string;
}

export interface Bullet {
  text: string;
  lead?: string;
  links?: Link[];
}

export interface TileSeed {
  metric: string;
  label?: string;
  sub: string;
  tone: Tone;
}

export interface AssetCardSeed {
  asset: string;
  metric: string;
  metric_label: string;
  value_display?: string;
  bullets: Bullet[];
}

export interface Theme {
  title: string;
  bullets: Bullet[];
}

export interface KeyIndicatorRow {
  area: string;
  metric: string;
  label?: string;
  latest: string;
  year_ago: string;
  ref_2019: string;
}

export interface InventoryRow {
  market: string;
  type: string;
  months: string;
  year_ago: string;
  median: string;
  sales_yy: string;
  source_url: string;
}

export interface MetroRow {
  metro: string;
  history_key: string | null;
  permits_ytd: string;
  permits_yy_pct: number | null;
  rent: string;
  rent_yy: string;
  office_vacancy: string;
  permits_url: string | null;
}

export interface EditionSeed {
  edition: string;
  edition_label: string;
  status: "draft" | "ready" | "published";
  published_at: string;
  data_as_of: string;
  data_as_of_label: string;
  headline_summary: string;
  month_in_brief: string;
  big_picture: string;
  metrics: Record<string, MetricSeed>;
  tiles: Record<"headline" | "rates" | "gauges" | "cre" | "texas", TileSeed[]>;
  asset_cards: AssetCardSeed[];
  next_month: { label: string; date: string }[];
  notes: Record<string, string>;
  tables: {
    key_indicators: KeyIndicatorRow[];
    gauge_explainer: { gauge: string; measures: string; levels: string; why: string }[];
    inventory: InventoryRow[];
    metros: MetroRow[];
    reference_levels: { indicator: string; metric?: string; reference: string; today: string }[];
    release_calendar: { date: string; release: string }[];
  };
  themes: Theme[];
  /** Written by scripts/build-edition.ts: provenance and the list of text to review. */
  build?: BuildInfo;
  // Free-form per-section content (bullet groups, chart values).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: Record<string, any>;
}

export interface BuildInfo {
  built_at: string;
  previous_edition: string | null;
  auto_generated_at: string | null;
  manual_file: string | null;
  draft_mode: boolean;
  needs_review: string[];
}

export interface Correlation {
  id: string;
  label: string;
  r: number;
  n: number;
  plain: string;
  note?: string;
}

export type AlertLevel = "normal" | "elevated" | "high" | "extreme";

export interface MarketAlert {
  level: AlertLevel;
  vix: number;
  vix_display: string;
  date_label: string;
  text: string;
  thresholds: string;
  inverted: boolean;
  inversion_text: string | null;
}

export interface ReferenceGroup {
  section: string;
  title: string;
  items: { title: string; url: string }[];
}

export interface Edition extends Omit<EditionSeed, "metrics"> {
  metrics: Record<string, Metric>;
  correlations: Correlation[];
  alert: MarketAlert;
  references: ReferenceGroup[];
  /** Long series for charts: the edition's frozen snapshot if it has one, else the live files. */
  history: import("./data").HistoryBundle;
  history_snapshot: boolean;
}
