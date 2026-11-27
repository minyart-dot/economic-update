// Kastle "Back to Work Barometer" office occupancy (SEMI, spec 11.1: "scrape weekly number; fall
// back to manual").
//
// The barometer page states the latest weekly 10-city average occupancy (% of pre-pandemic) and
// the week it covers. Its wording and markup change without notice, so parseKastle() is strict and
// refuses anything it is not sure about: the value must follow a "10-city average" label, every
// such mention on the page must agree, exactly one "week ending <date>" must be present, the value
// must be 20–100 and the week must end within 21 days before the edition's reference date. Any
// failure throws, run.ts then keeps the last published value marked stale, and the metric stays in
// the manual template for the owner to enter by hand.
//
// The page could not be reached from the build environment, so the accepted wording is based on
// how Kastle has described the barometer, not on a live copy. Override the URL with KASTLE_URL.

import { fetchText, type HttpOptions } from "./http";
import { addDays, labelOf } from "./periods";
import type { Computed, SaveRaw } from "./types";

export const KASTLE_SOURCE_URL = "https://www.kastle.com/safety-wellness/getting-america-back-to-work/";

export const KASTLE_MIN = 20;
export const KASTLE_MAX = 100;
export const KASTLE_MAX_AGE_DAYS = 21;

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "Nov", "nov", "Sept", "November" -> 11 etc.; null for anything else. */
function monthNumber(word: string): number | null {
  const w = word.toLowerCase();
  if (w === "sept") return 9;
  const i = MONTH_NAMES.findIndex((n) => n === w || (w.length === 3 && n.startsWith(w)));
  return i < 0 ? null : i + 1;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", percnt: "%" };

/** Visible text of an HTML page: scripts/styles dropped, tags removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "November 19, 2026", "Nov. 19 2026", "11/19/2026", "2026-11-19" -> "2026-11-19" (null if not a real date). */
export function parseWeekDate(s: string): string | null {
  let m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = monthNumber(m[1]);
    if (!month) return null;
    return validDate(Number(m[3]), month, Number(m[2]));
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return validDate(Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

// "10-city average", "10-City Average occupancy", "ten-city average occupancy rate was", then the number.
// The words between label and number are captured so peaks, single days and year-ago mentions
// ("10-city average peaked Tuesday at 67%") can be skipped rather than mistaken for the average.
const VALUE_RE = /\b(?:10|ten)[\s-]*city\s+(?:average|avg\.?)([^%\d]{0,40}?)(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent\b)/gi;
const NOT_THE_AVERAGE = /peak|high|low|day\b|year|ago|record|since/i;
const WEEK_RE = /\bweek\s+ending\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/gi;

export interface KastleReading {
  value: number;
  /** Week-ending date, YYYY-MM-DD. */
  week_ending: string;
}

/**
 * Pure parser over the page HTML (or text). Throws unless exactly one 10-city average value and
 * exactly one week-ending date can be read. `refDate` (YYYY-MM-DD) is the edition's reference
 * date; the week must end on or before it and no more than KASTLE_MAX_AGE_DAYS days earlier.
 */
export function parseKastle(html: string, refDate: string): KastleReading {
  const text = htmlToText(html);
  const values = [...text.matchAll(VALUE_RE)].filter((m) => !NOT_THE_AVERAGE.test(m[1])).map((m) => Number(m[2]));
  if (!values.length) throw new Error("Kastle page: no '10-city average ... NN%' figure found (page layout may have changed)");
  const distinct = [...new Set(values)];
  if (distinct.length > 1) throw new Error(`Kastle page: ambiguous 10-city average (found ${distinct.join("%, ")}%)`);
  const value = distinct[0];
  if (!(value >= KASTLE_MIN && value <= KASTLE_MAX)) {
    throw new Error(`Kastle page: 10-city average ${value}% is outside the plausible range ${KASTLE_MIN}–${KASTLE_MAX}%`);
  }

  const rawDates = [...text.matchAll(WEEK_RE)].map((m) => m[1]);
  if (!rawDates.length) throw new Error("Kastle page: no 'week ending <date>' found (page layout may have changed)");
  const dates = rawDates.map((d) => {
    const iso = parseWeekDate(d);
    if (!iso) throw new Error(`Kastle page: cannot read week-ending date "${d}"`);
    return iso;
  });
  const distinctDates = [...new Set(dates)];
  if (distinctDates.length > 1) throw new Error(`Kastle page: ambiguous week-ending date (found ${distinctDates.join(", ")})`);
  const week = distinctDates[0];
  if (week > refDate) throw new Error(`Kastle page: week ending ${week} is after the edition reference date ${refDate}`);
  if (week < addDays(refDate, -KASTLE_MAX_AGE_DAYS)) {
    throw new Error(`Kastle page: week ending ${week} is more than ${KASTLE_MAX_AGE_DAYS} days before ${refDate} (page not updated?)`);
  }
  return { value, week_ending: week };
}

/** Earlier of `now` and the last day of the edition month, as YYYY-MM-DD. */
export function kastleRefDate(edition: string, now: Date): string {
  const [y, m] = edition.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return today < monthEnd ? today : monthEnd;
}

/** Record in the edition's style: "~56%", no year-ago (the page does not state one). */
export function computeKastle(r: KastleReading): Computed {
  return {
    value: r.value,
    period: r.week_ending,
    period_label: `week ending ${labelOf(r.week_ending, "weekly")}`,
    year_ago: null,
    year_ago_period: null,
    as_of: r.week_ending,
    display: `~${Math.round(r.value)}%`,
  };
}

export async function fetchKastle(
  url: string,
  refDate: string,
  http?: HttpOptions,
  saveRaw?: SaveRaw,
): Promise<Computed> {
  const html = await fetchText(url, http);
  saveRaw?.("kastle/barometer.html", html);
  return computeKastle(parseKastle(html, refDate));
}
