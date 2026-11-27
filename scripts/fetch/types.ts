// Shared types for the automated fetchers (spec 11.1) and the auto.json contract
// consumed by scripts/build-edition.ts.

/** One observation of a time series. `date` is YYYY-MM-DD (monthly/quarterly: first day of the period). */
export interface Obs {
  date: string;
  /** null = the source published no value for this period (FRED "."). Never filled in. */
  value: number | null;
}

export type SeriesFrequency = "daily" | "weekly" | "monthly" | "quarterly";

/** One metric record in data/raw/YYYY-MM/auto.json. */
export interface AutoRecord {
  value: number | null;
  /** "YYYY-MM", "YYYY-MM-DD", "YYYY-Qn", or "YYYY-MM/YYYY-MM" for year-to-date ranges. */
  period: string;
  period_label: string;
  year_ago: number | null;
  year_ago_period: string | null;
  as_of: string;
  source_url: string;
  /** true = the fetch failed and the value was carried over from the latest edition. */
  stale: boolean;
  error: string | null;
  /** Optional preformatted text when a single number cannot express the value (fed funds range). */
  display?: string;
  year_ago_display?: string;
  /** Optional context sentence for the metric's notes (payrolls_change: prior 12-month average). */
  notes?: string;
}

/** A computed value before the source URL and status flags are attached. */
export type Computed = Omit<AutoRecord, "source_url" | "stale" | "error">;

export interface AutoFile {
  generated_at: string;
  edition: string;
  metrics: Record<string, AutoRecord>;
  /**
   * Values that feed tables rather than a metrics.yaml metric (Texas metro permits and rents
   * for tables.metros). Same record shape. Keys are not metric ids.
   */
  extras: Record<string, AutoRecord>;
}

/** Saves a raw API response for the audit trail (data/raw/YYYY-MM/...). */
export type SaveRaw = (relPath: string, body: string) => void;
