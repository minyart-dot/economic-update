// Market alert banner logic (spec Section 9). Pure.

import type { AlertLevel, MarketAlert } from "./types";

export const VIX_THRESHOLDS = { elevated: 20, high: 30, extreme: 40 } as const;
export const THRESHOLD_TEXT = "Thresholds: 20 elevated · 30 high · 40 extreme.";

export function vixLevel(v: number): AlertLevel {
  if (v >= VIX_THRESHOLDS.extreme) return "extreme";
  if (v >= VIX_THRESHOLDS.high) return "high";
  if (v >= VIX_THRESHOLDS.elevated) return "elevated";
  return "normal";
}

export function buildAlert(vix: number, dateLabel: string, yieldCurve: number | null): MarketAlert {
  const level = vixLevel(vix);
  const v = vix.toFixed(2);
  const text = {
    normal: `● VIX NORMAL · ${v} (${dateLabel}), below 20.`,
    elevated: `▲ VIX ELEVATED · ${v} (${dateLabel}), above 20, the level commonly watched as a sign of heightened uncertainty.`,
    high: `▲ VIX HIGH ALERT · ${v} (${dateLabel}), above 30, a level historically associated with market stress.`,
    extreme: `▲ VIX EXTREME · ${v} (${dateLabel}), above 40, a level historically seen only in acute crises (2008, 2020).`,
  }[level];
  const inverted = yieldCurve != null && yieldCurve < 0;
  return {
    level,
    vix,
    vix_display: v,
    date_label: dateLabel,
    text,
    thresholds: THRESHOLD_TEXT,
    inverted,
    inversion_text: inverted ? "Yield curve inverted (10-yr below 2-yr)" : null,
  };
}
