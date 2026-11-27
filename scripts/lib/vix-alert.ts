// Between-edition volatility alert (spec Section 9 "Between-edition alerts", 12.3).
// Pure helpers (CSV parsing, cooldown, decision, email text) plus runVixAlert(), which the CLI
// scripts/vix-alert.ts and the tests call. Reports data only: no forecasts, no recommendations.

import fs from "node:fs";
import { buildAlert, THRESHOLD_TEXT, vixLevel } from "../../lib/alert";
import { alertLogPath, lastSentAlert, loadAlertLog, longDateLabel, type AlertLogEntry } from "../../lib/alerts";
import { ALERTS_TAG, sendTagOnlyEmail, type TagOnlyResult } from "../../lib/buttondown";
import { fredClient } from "../fetch/fred";
import { csvToObjects, fetchText, type HttpOptions } from "../fetch/http";

export const DEFAULT_THRESHOLD = 30;
/** No second alert until this many weekdays have passed since the last one. */
export const COOLDOWN_TRADING_DAYS = 5;
/** A close older than this many weekdays before the run date is treated as stale (no alert). */
export const MAX_CLOSE_AGE_WEEKDAYS = 3;
export const CBOE_VIX_CSV = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";
export const FRED_VIX_SERIES = "VIXCLS";

export interface Close {
  date: string; // YYYY-MM-DD
  close: number;
}

export type CloseSource = "FRED VIXCLS" | "Cboe VIX_History.csv";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cboe's daily VIX history CSV (header DATE,OPEN,HIGH,LOW,CLOSE; dates MM/DD/YYYY) to closes,
 * sorted by date. Rows with a blank or non-numeric close are skipped, never filled.
 */
export function parseCboeVixCsv(text: string): Close[] {
  const out: Close[] = [];
  for (const row of csvToObjects(text)) {
    const date = normalizeDate(row.date ?? "");
    const raw = row.close ?? "";
    const close = raw === "" ? NaN : Number(raw);
    if (date && Number.isFinite(close)) out.push({ date, close });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (ISO.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

const dayOfWeek = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Weekdays in (from, to]: Monday..Friday after `from`, up to and including `to`. Market holidays
 * are NOT excluded (a holiday counts as a trading day), so the cooldown can end a day early
 * around holidays. Returns 0 when to <= from.
 */
export function weekdaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = nextDay(from); d <= to; d = nextDay(d)) {
    const w = dayOfWeek(d);
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

export type Decision =
  | { action: "alert"; close: Close; threshold: number }
  | { action: "below"; close: Close; threshold: number }
  | { action: "cooldown"; close: Close; threshold: number; last: AlertLogEntry }
  | { action: "duplicate"; close: Close; threshold: number; last: AlertLogEntry };

/** Section 9 rule: alert when close >= threshold and no alert was sent in the last 5 trading days. */
export function decide(close: Close, log: AlertLogEntry[], threshold = DEFAULT_THRESHOLD): Decision {
  if (!(close.close >= threshold)) return { action: "below", close, threshold };
  const last = lastSentAlert(log);
  if (last && last.date >= close.date) return { action: "duplicate", close, threshold, last };
  if (last && weekdaysBetween(last.date, close.date) < COOLDOWN_TRADING_DAYS) return { action: "cooldown", close, threshold, last };
  return { action: "alert", close, threshold };
}

const fmtThreshold = (t: number) => (Number.isInteger(t) ? String(t) : t.toFixed(2));

/** The alert email (Markdown, as Buttondown accepts). Short, neutral, data only. */
export function buildAlertEmail(opts: { close: Close; threshold: number; siteUrl: string; source: CloseSource; test?: boolean }): {
  subject: string;
  body: string;
} {
  const v = opts.close.close.toFixed(2);
  const relation = opts.close.close >= opts.threshold ? "above" : "below";
  const long = longDateLabel(opts.close.date);
  const short = new Date(`${opts.close.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const t = fmtThreshold(opts.threshold);
  const banner = buildAlert(opts.close.close, short, null).text;
  const gauges = `${opts.siteUrl.replace(/\/$/, "")}/#gauges`;
  const sourceUrl = opts.source === "FRED VIXCLS" ? "https://fred.stlouisfed.org/series/VIXCLS" : CBOE_VIX_CSV;
  const body = [
    ...(opts.test ? ["TEST DRAFT created with --force to check the audience. The alert rule was not met; do not send.", ""] : []),
    `Market volatility alert: the VIX closed at ${v} on ${long}, ${relation} ${t}. This is an automated data notice, not advice.`,
    "",
    banner,
    THRESHOLD_TEXT,
    "",
    `Market risk gauges in the latest edition: ${gauges}`,
    "",
    `Source: ${opts.source} (${sourceUrl}).`,
    "",
    `You receive this because you opted into market alerts. At most one alert per ${COOLDOWN_TRADING_DAYS} trading days.`,
    "Unsubscribe: {{ unsubscribe_url }}",
    "",
  ].join("\n");
  return { subject: `${opts.test ? "[TEST] " : ""}Market volatility alert: VIX closed at ${v} on ${short}`, body };
}

/** Today's date in America/Chicago (the alert runs after the 4:15pm CT VIX close). */
export function todayCentral(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Latest close on or before `date` from a list (null when none). */
export function latestOnOrBefore(closes: Close[], date: string): Close | null {
  let best: Close | null = null;
  for (const c of closes) if (c.date <= date && (!best || c.date > best.date)) best = c;
  return best;
}

export interface FetchedClose extends Close {
  source: CloseSource;
}

/**
 * Latest VIX close on or before `date`: FRED VIXCLS first; when FRED has nothing for `date` yet
 * (it usually posts the next morning) and `cboe` is on, Cboe's CSV is tried and the newer of the
 * two is used. Each failure is reported in `warnings`; null when both fail.
 */
export async function fetchLatestClose(opts: {
  date: string;
  fredApiKey: string | undefined;
  fredApiBase?: string;
  cboe: boolean;
  cboeUrl?: string;
  http?: HttpOptions;
  warnings: string[];
}): Promise<FetchedClose | null> {
  let fred: FetchedClose | null = null;
  try {
    const get = fredClient({ apiKey: opts.fredApiKey, apiBase: opts.fredApiBase, edition: opts.date.slice(0, 7), http: opts.http });
    const obs = await get(FRED_VIX_SERIES);
    const closes = obs.filter((o): o is { date: string; value: number } => o.value !== null).map((o) => ({ date: o.date, close: o.value }));
    const c = latestOnOrBefore(closes, opts.date);
    if (c) fred = { ...c, source: "FRED VIXCLS" };
    else opts.warnings.push(`FRED ${FRED_VIX_SERIES} has no close on or before ${opts.date}.`);
  } catch (e) {
    opts.warnings.push(`FRED ${FRED_VIX_SERIES} failed: ${(e as Error).message}`);
  }
  if (fred?.date === opts.date || !opts.cboe) return fred;
  try {
    const text = await fetchText(opts.cboeUrl ?? CBOE_VIX_CSV, opts.http);
    const c = latestOnOrBefore(parseCboeVixCsv(text), opts.date);
    if (c && (!fred || c.date > fred.date)) return { ...c, source: "Cboe VIX_History.csv" };
    if (!c) opts.warnings.push(`Cboe CSV has no close on or before ${opts.date}.`);
  } catch (e) {
    opts.warnings.push(`Cboe CSV failed: ${(e as Error).message}`);
  }
  return fred;
}

export type Mode = "check" | "dry-run" | "send";

export interface RunOptions {
  mode: Mode;
  date: string;
  threshold: number;
  /** dry-run only: create the draft even when the rule says no alert (to check the audience). */
  force?: boolean;
  cboe?: boolean;
  root?: string;
  env?: Record<string, string | undefined>;
  http?: HttpOptions;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface RunResult {
  decision: Decision | null;
  email?: { subject: string; body: string };
  buttondown?: TagOnlyResult;
  logged?: AlertLogEntry;
  warnings: string[];
  /** true when the run should fail the workflow (refused or failed send, no data at all). */
  failed: boolean;
}

export async function runVixAlert(o: RunOptions): Promise<RunResult> {
  const env = o.env ?? process.env;
  const root = o.root ?? process.cwd();
  const say = o.log ?? console.log;
  const warnings: string[] = [];
  if (!ISO.test(o.date)) throw new Error(`--date must be YYYY-MM-DD, got ${o.date}`);
  if (!(o.threshold > 0)) throw new Error(`threshold must be a positive number, got ${o.threshold}`);
  if (o.force && o.mode !== "dry-run") throw new Error("--force is only allowed with --dry-run");

  const close = await fetchLatestClose({
    date: o.date,
    fredApiKey: env.FRED_API_KEY,
    fredApiBase: env.FRED_API_BASE || undefined,
    cboe: o.cboe ?? true,
    cboeUrl: env.CBOE_VIX_CSV_URL || undefined,
    http: o.http,
    warnings,
  });
  warnings.forEach((w) => say(`warning: ${w}`));
  if (!close) {
    say("No VIX close available from FRED or Cboe. Nothing sent.");
    return { decision: null, warnings, failed: true };
  }
  say(`Latest VIX close: ${close.close.toFixed(2)} on ${close.date} (${close.source}). Threshold ${fmtThreshold(o.threshold)}.`);
  const age = weekdaysBetween(close.date, o.date);
  if (age > MAX_CLOSE_AGE_WEEKDAYS) {
    say(`That close is ${age} weekdays old (more than ${MAX_CLOSE_AGE_WEEKDAYS}); treating it as stale. Nothing sent.`);
    return { decision: null, warnings, failed: false };
  }

  const log = loadAlertLog(root);
  const decision = decide(close, log, o.threshold);
  const explain = {
    alert: "At or above the threshold and no alert in the last 5 trading days: alert.",
    below: "Below the threshold: no alert.",
    cooldown: `In cooldown: last alert ${"last" in decision ? decision.last.date : ""} is fewer than ${COOLDOWN_TRADING_DAYS} trading days ago.`,
    duplicate: `Already alerted for ${"last" in decision ? decision.last.date : ""}.`,
  }[decision.action];
  say(explain);

  const proceed = decision.action === "alert" || (o.mode === "dry-run" && o.force);
  if (o.mode === "check" || !proceed) return { decision, warnings, failed: false };

  if (o.mode === "send" && !env.SITE_URL) throw new Error("SITE_URL must be set to send (links would point to localhost)");
  const siteUrl = env.SITE_URL || "http://localhost:3000";
  const email = buildAlertEmail({ close, threshold: o.threshold, siteUrl, source: close.source, test: decision.action !== "alert" });
  say(`Subject: ${email.subject}\n---\n${email.body}---`);

  const bd = await sendTagOnlyEmail({ subject: email.subject, body: email.body, tag: ALERTS_TAG, send: o.mode === "send" });
  if (bd.kind === "refused" || bd.kind === "error") {
    say(`Not sent: ${bd.reason}`);
    return { decision, email, buttondown: bd, warnings, failed: true };
  }
  if (bd.kind === "draft") {
    say(`Created a DRAFT (id ${bd.id}) in Buttondown for subscribers tagged "${ALERTS_TAG}". Check its audience in Buttondown > Emails. Nothing was sent.`);
    return { decision, email, buttondown: bd, warnings, failed: false };
  }

  const entry: AlertLogEntry = {
    date: close.date,
    vix: close.close,
    level: vixLevel(close.close),
    threshold: o.threshold,
    sent_at: (o.now?.() ?? new Date()).toISOString(),
    mode: "send",
  };
  fs.writeFileSync(alertLogPath(root), JSON.stringify([...log, entry], null, 2) + "\n");
  say(`Sent to subscribers tagged "${ALERTS_TAG}" (Buttondown email ${bd.id}). Logged to data/alerts.json.`);
  return { decision, email, buttondown: bd, logged: entry, warnings, failed: false };
}
