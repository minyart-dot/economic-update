// Comparison, arrow and color rules (spec Section 5). Pure functions, shared by the page
// and (in Phase 3) scripts/build-edition.ts. Direction and color are never typed by hand.

import type {
  ChangeColor,
  Direction,
  FlatThreshold,
  Polarity,
  ReportedChange,
  Unit,
} from "./types";

const POINT_UNITS: Unit[] = ["pct", "pts"];

export function defaultFlatThreshold(unit: Unit): FlatThreshold {
  return POINT_UNITS.includes(unit) ? { points: 0.05 } : { relative: 0.01 };
}

export interface ChangeResult {
  change_abs: number | null;
  change_pct: number | null;
  direction: Direction | null;
}

/**
 * Year-over-year change. Uses the year-ago level when it exists. When the source publishes
 * only the y/y change (e.g. "+3.3% vs. Q2 2025"), that reported change sets the direction.
 * With neither, there is no comparison and no arrow.
 */
export function computeChange(
  value: number | null,
  yearAgo: number | null,
  reported: ReportedChange | null | undefined,
  unit: Unit,
  threshold?: FlatThreshold,
): ChangeResult {
  if (value == null) return { change_abs: null, change_pct: null, direction: null };

  let change_abs: number | null = null;
  let change_pct: number | null = null;

  if (yearAgo != null) {
    change_abs = round(value - yearAgo, 6);
    change_pct = yearAgo !== 0 ? round(((value - yearAgo) / Math.abs(yearAgo)) * 100, 4) : null;
  } else if (reported && (reported.pct != null || reported.points != null)) {
    change_abs = reported.points ?? null;
    change_pct = reported.pct ?? null;
  } else {
    return { change_abs: null, change_pct: null, direction: null };
  }

  const t = threshold ?? defaultFlatThreshold(unit);
  let sign: number;
  if ("points" in t && change_abs != null) {
    sign = Math.abs(change_abs) < t.points ? 0 : Math.sign(change_abs);
  } else {
    const rel = "relative" in t ? t.relative : 0.01;
    if (change_pct != null) {
      sign = Math.abs(change_pct) / 100 < rel ? 0 : Math.sign(change_pct);
    } else if (change_abs != null) {
      sign = Math.abs(change_abs) < 0.05 ? 0 : Math.sign(change_abs);
    } else {
      return { change_abs, change_pct, direction: null };
    }
  }

  const direction: Direction = sign > 0 ? "up" : sign < 0 ? "down" : "flat";
  return { change_abs, change_pct, direction };
}

/** green if the direction matches the polarity, red if opposite, black if flat or mixed. */
export function colorFor(direction: Direction | null, polarity: Polarity): ChangeColor | null {
  if (direction == null) return null;
  if (direction === "flat" || polarity === "mixed") return "neutral";
  const good =
    (direction === "up" && polarity === "higher_is_good") ||
    (direction === "down" && polarity === "lower_is_good");
  return good ? "good" : "bad";
}

export const ARROW: Record<Direction, string> = { up: "▲", down: "▼", flat: "▶" };
export const PILL_WORD: Record<Direction, string> = {
  up: "Higher",
  down: "Lower",
  flat: "Unchanged",
};

export function srText(direction: Direction, color: ChangeColor): string {
  const dir = direction === "up" ? "up" : direction === "down" ? "down" : "unchanged";
  const read =
    color === "good" ? "favorable" : color === "bad" ? "unfavorable" : "flat or mixed";
  return `${dir} versus a year ago, ${read}`;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
