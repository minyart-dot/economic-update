// Pure date/period helpers for the fetchers: period ids, labels and year-ago matching.

import type { Obs, SeriesFrequency } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** First day of the month `months` away from `date`'s month. */
export function addMonths(date: string, months: number): string {
  const d = parse(date);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Same calendar date one year earlier (Feb 29 becomes Feb 28). */
export function sameDateYearEarlier(date: string): string {
  const y = Number(date.slice(0, 4)) - 1;
  const md = date.slice(5, 10);
  if (md === "02-29") return `${y}-02-28`;
  return `${y}-${md}`;
}

export function monthLabel(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1];
}

/** Period id in the auto.json format for an observation date. */
export function periodOf(date: string, freq: SeriesFrequency): string {
  if (freq === "monthly") return date.slice(0, 7);
  if (freq === "quarterly") return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
  return date.slice(0, 10);
}

/** Short label: "Oct" (monthly), "Q2" (quarterly), "Nov 19" (daily/weekly). */
export function labelOf(date: string, freq: SeriesFrequency): string {
  if (freq === "monthly") return monthLabel(date);
  if (freq === "quarterly") return periodOf(date, "quarterly").slice(5);
  return `${monthLabel(date)} ${Number(date.slice(8, 10))}`;
}

/** The most recent observation with a value (trailing "." observations are skipped, never filled). */
export function latestObs(obs: Obs[]): Obs | null {
  for (let i = obs.length - 1; i >= 0; i--) if (obs[i].value !== null) return obs[i];
  return null;
}

/** Nearest observation with a value dated on or before `target`, but not before `floor`. */
function onOrBefore(obs: Obs[], target: string, floor: string): Obs | null {
  let best: Obs | null = null;
  for (const o of obs) {
    if (o.value === null || o.date > target || o.date < floor) continue;
    if (!best || o.date > best.date) best = o;
  }
  return best;
}

/**
 * The year-ago observation for `date` (spec 5.1, 11.1):
 * - monthly: the same month a year earlier. If the source published nothing for that month
 *   (e.g. October 2025, not collected during the shutdown), the nearest earlier month, up to
 *   two months back; the returned date shows which month was used.
 * - quarterly: the same quarter a year earlier (or the quarter before it if missing).
 * - weekly: the same week a year earlier (52 weeks = 364 days back, so the weekday matches),
 *   nearest observation on or before that date within 7 days (so the prior week if that week is missing).
 * - daily: the same calendar date a year earlier, nearest observation on or before it within 7 days
 *   (weekends and holidays have no observation).
 */
export function findYearAgo(obs: Obs[], date: string, freq: SeriesFrequency): Obs | null {
  if (freq === "monthly" || freq === "quarterly") {
    const step = freq === "monthly" ? 1 : 3;
    const tries = freq === "monthly" ? 3 : 2;
    for (let k = 0; k < tries; k++) {
      const target = addMonths(date, -12 - k * step);
      const hit = obs.find((o) => o.date === target && o.value !== null);
      if (hit) return hit;
    }
    return null;
  }
  const target = freq === "weekly" ? addDays(date, -364) : sameDateYearEarlier(date);
  return onOrBefore(obs, target, addDays(target, -7));
}

/** Rounds away floating-point noise (not a display rounding). */
export function clean(x: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
