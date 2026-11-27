// Display formatting by unit (spec Section 14.1: percentages to 1 decimal, 2 for rates
// where the source gives 2; counts with thousands separators; money as $X,XXX or $X.XXM/B).

import type { MetricConfig } from "./types";

export const MISSING = "—";

export function formatValue(value: number | null, cfg: Pick<MetricConfig, "unit" | "decimals" | "signed">): string {
  if (value == null || Number.isNaN(value)) return MISSING;
  const d = cfg.decimals;
  const sign = cfg.signed && value > 0 ? "+" : "";
  switch (cfg.unit) {
    case "pct":
      return `${sign}${value.toFixed(d ?? 1)}%`;
    case "pts":
      return `${sign}${value.toFixed(d ?? 2)} pts`;
    case "usd":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: d ?? 0, minimumFractionDigits: d ?? 0 })}`;
    case "usd_bn":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: d ?? 0 })}B`;
    case "millions":
      return `${sign}${value.toFixed(d ?? 2)}M`;
    case "thousands":
      return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: d ?? 0 })}K`;
    case "count":
      return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: d ?? 0, minimumFractionDigits: d ?? 0 })}`;
    case "months":
    case "index":
    case "ratio":
    case "days":
    default:
      return `${sign}${value.toFixed(d ?? 1)}`;
  }
}

export function formatPctChange(pct: number, decimals = 1): string {
  const s = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${s}${Math.abs(pct).toFixed(decimals)}%`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
