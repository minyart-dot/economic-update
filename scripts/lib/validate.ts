// Quality gates for an edition (spec Section 14.3). Pure apart from the optional link check.
// FAIL blocks publishing; WARN goes into the PR comment; INFO explains allow-listed matches.

import { enrichMetrics } from "../../lib/edition";
import { defaultFlatThreshold } from "../../lib/compare";
import type { EditionSeed, Frequency, Metric, MetricSeed, MetricsFile, SourceEntry } from "../../lib/types";
import { DAY_MS, periodEnd } from "./io";

export type Level = "FAIL" | "WARN" | "INFO";
export interface Finding {
  level: Level;
  rule: string;
  where: string;
  message: string;
}

export interface ValidateInput {
  edition: EditionSeed;
  cfg: MetricsFile;
  sources: SourceEntry[];
  previous?: EditionSeed | null;
  draftSummary?: string | null;
  /** Reference date for freshness; defaults to the edition's data_as_of, then today. */
  today?: Date;
}

export const RULES = {
  source: "Source and as-of on every number",
  arrow: "Arrows only for y/y comparisons",
  draftNumbers: "Draft summary numbers exist in the edition",
  banned: "No forecast or advice words",
  freshness: "Data freshness (max_age_days)",
  bigMove: "Large move vs. previous edition",
  consistency: "Same metric, same value everywhere",
  linkPhrase: "Bullet link phrases occur in their text",
  registry: "Source URLs in data/config/sources.yaml",
  stale: "Stale or carried-forward values",
  brokenLink: "Broken links",
} as const;

// ---------------------------------------------------------------- neutrality (spec 5.4, 14.3, Appendix E)

export const BANNED: { word: string; re: RegExp }[] = [
  { word: "will", re: /\bwill\b/gi },
  { word: "expect", re: /\bexpect(s|ed|ing|ation|ations)?\b/gi },
  { word: "forecast", re: /\bforecast(s|ed|ing)?\b/gi },
  { word: "likely", re: /\blikely\b/gi },
  { word: "poised", re: /\bpoised\b/gi },
  { word: "bubble", re: /\bbubbles?\b/gi },
  { word: "crash", re: /\bcrash(es|ed|ing)?\b/gi },
  { word: "opportunity", re: /\bopportunit(y|ies)\b/gi },
  { word: "should buy", re: /\bshould buy\b/gi },
  { word: "should sell", re: /\bshould sell\b/gi },
];

/**
 * Phrases that contain a banned word but are not forecasts or advice. Each entry must say why.
 * The rule itself is not weakened: a banned word anywhere else still fails.
 */
export const BANNED_ALLOW: { re: RegExp; reason: string }[] = [
  {
    re: /\bno forecasts?\b/gi,
    reason: 'Negation: the required disclaimer "Data only; no forecast" (spec 5.3) says the brief does not forecast.',
  },
  {
    re: /\b(?:not|never|does not|doesn't|do not|is not|isn't) (?:a |an )?forecasts?\b/gi,
    reason: "Negation: states that something is not a forecast.",
  },
  {
    re: /\bexpected S&P 500 (?:swings|volatility)\b/gi,
    reason:
      "Definition of the VIX index (Cboe defines it as the market's expected 30-day S&P 500 volatility, derived from option prices). It describes what the gauge measures, not a prediction by the brief.",
  },
];

/** Remove URLs, Markdown link targets and quoted titles (spec: "excluding quoted source titles"). */
export function stripForWordCheck(s: string): string {
  return s
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/"[^"\n]*"|“[^”\n]*”/g, " ");
}

export interface BannedHit {
  word: string;
  context: string;
  allowed: string | null;
}

export function findBannedWords(text: string): BannedHit[] {
  const s = stripForWordCheck(text);
  const allowSpans: { from: number; to: number; reason: string }[] = [];
  for (const a of BANNED_ALLOW) {
    for (const m of s.matchAll(a.re)) allowSpans.push({ from: m.index!, to: m.index! + m[0].length, reason: a.reason });
  }
  const hits: BannedHit[] = [];
  for (const b of BANNED) {
    for (const m of s.matchAll(b.re)) {
      const i = m.index!;
      const span = allowSpans.find((x) => i >= x.from && i < x.to);
      const context = s.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\s+/g, " ").trim();
      hits.push({ word: b.word, context, allowed: span?.reason ?? null });
    }
  }
  return hits;
}

// ---------------------------------------------------------------- numbers in text

export interface NumberToken {
  value: number;
  decimals: number;
  raw: string;
}

/** Numbers in a string: handles 1,234,567 / 4.1% / −0.6 (Unicode minus) / $416,700 / 3.75M. */
export function numbersIn(s: string): NumberToken[] {
  const out: NumberToken[] = [];
  const re = /([−\-+]?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
  for (const m of s.replace(/https?:\/\/\S+/g, " ").matchAll(re)) {
    const prev = m.index! > 0 ? s[m.index! - 1] : "";
    // A sign only counts when it is not a hyphen inside a word or range ("16-year", "2025–26").
    const signed = m[1] && !(m[1] === "-" && /[\w)]/.test(prev)) ? m[1] : "";
    const digits = m[2].replace(/,/g, "");
    const dec = digits.includes(".") ? digits.split(".")[1].length : 0;
    const v = Number(digits) * (signed === "−" || signed === "-" ? -1 : 1);
    if (Number.isFinite(v)) out.push({ value: v, decimals: dec, raw: m[0] });
  }
  return out;
}

/** True if a displayed number is the value rounded to the shown precision (at least ±0.05). */
function matchesShown(value: number, t: NumberToken): boolean {
  const tol = Math.max(0.05, 0.5 * 10 ** -t.decimals) + 1e-9;
  return Math.abs(Math.abs(value) - Math.abs(t.value)) <= tol;
}

/** Does any number (or a range a–b around the value) in `text` show `value`? null if text has no numbers. */
export function textShowsValue(text: string, value: number): boolean | null {
  const nums = numbersIn(text);
  if (!nums.length) return null;
  if (nums.some((n) => matchesShown(value, n))) return true;
  for (let i = 0; i + 1 < nums.length; i++) {
    const [a, b] = [Math.abs(nums[i].value), Math.abs(nums[i + 1].value)];
    if (Math.min(a, b) <= Math.abs(value) && Math.abs(value) <= Math.max(a, b)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- walking the edition

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function walk(node: unknown, path: string, visit: (path: string, key: string, value: unknown, parent: unknown) => void, key = "", parent: unknown = null) {
  visit(path, key, node, parent);
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`, visit, String(i), node));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, visit, k, node);
  }
}

const NON_TEXT_KEYS = new Set(["status", "edition", "published_at", "data_as_of", "history_key", "newsletter_sent_at", "build"]);
const isUrlKey = (k: string) => /url$/i.test(k);

/** Every reader-facing string in the edition, with its path (URLs and ids excluded). */
export function narrativeStrings(e: EditionSeed): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (NON_TEXT_KEYS.has(k)) continue;
    if (k === "metrics") {
      for (const [id, m] of Object.entries(v as Record<string, MetricSeed>)) {
        for (const f of ["display", "year_ago_display", "footnote", "notes", "ref_2019", "period_label", "year_ago_label", "carry_forward_reason"] as const) {
          const s = m[f];
          if (typeof s === "string" && s) out.push({ path: `metrics.${id}.${f}`, text: s });
        }
      }
      continue;
    }
    walk(v, k, (p, key, val) => {
      if (typeof val === "string" && !isUrlKey(key) && !/\.links\[\d+\]\.phrase$/.test(p)) out.push({ path: p, text: val });
    });
  }
  return out;
}

function allNumbersInEdition(e: EditionSeed, metrics: Record<string, Metric>): number[] {
  const pool: number[] = [];
  walk(e as unknown as Json, "", (_p, key, val) => {
    if (typeof val === "number") pool.push(val);
    else if (typeof val === "string" && !isUrlKey(key)) for (const n of numbersIn(val)) pool.push(n.value);
  });
  for (const m of Object.values(metrics)) {
    for (const n of [m.value, m.year_ago, m.change_abs, m.change_pct]) if (n != null) pool.push(n);
    for (const s of [m.display, m.year_ago_display ?? ""]) for (const n of numbersIn(s)) pool.push(n.value);
  }
  return pool;
}

// ---------------------------------------------------------------- rules

const STEPS_PER_YEAR: Record<Frequency, number> = { daily: 12, weekly: 12, monthly: 12, snapshot: 12, quarterly: 4, annual: 1 };

/** Reference-level rows whose "today" is a derived statistic, not the linked metric's value. */
export const DERIVED_REFERENCE_ROWS: Record<string, string> = {
  "Sahm rule":
    "The Sahm rule reading is derived from the unemployment rate (3-month average vs. 12-month low); the row links the unemployment source but does not show the rate itself.",
};

function bulletsWithLinks(e: EditionSeed): { path: string; text: string; lead?: string; links: { phrase: string; url: string }[] }[] {
  const out: { path: string; text: string; lead?: string; links: { phrase: string; url: string }[] }[] = [];
  walk(e, "", (p, _k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "text" in v && "links" in v) {
      const b = v as { text: string; lead?: string; links?: { phrase: string; url: string }[] };
      if (Array.isArray(b.links)) out.push({ path: p, text: b.text, lead: b.lead, links: b.links });
    }
  });
  return out;
}

export function validateEdition(input: ValidateInput): Finding[] {
  const { edition: e, cfg, sources, previous, draftSummary } = input;
  const F: Finding[] = [];
  const add = (level: Level, rule: keyof typeof RULES, where: string, message: string) =>
    F.push({ level, rule: RULES[rule], where, message });

  // Recompute with the same code as the page. Unknown metric ids are a FAIL, not a crash.
  const known: Record<string, MetricSeed> = {};
  for (const [id, m] of Object.entries(e.metrics)) {
    if (cfg.metrics[id]) known[id] = m;
    else add("FAIL", "source", `metrics.${id}`, "Metric is not in data/config/metrics.yaml (no source, unit or polarity).");
  }
  const metrics = enrichMetrics({ ...e, metrics: known }, cfg);

  // Metrics referenced by the layout must exist.
  const refs: { where: string; id: string }[] = [
    ...Object.entries(e.tiles).flatMap(([g, ts]) => ts.map((t, i) => ({ where: `tiles.${g}[${i}]`, id: t.metric }))),
    ...e.asset_cards.map((a, i) => ({ where: `asset_cards[${i}]`, id: a.metric })),
    ...e.tables.key_indicators.map((r, i) => ({ where: `tables.key_indicators[${i}]`, id: r.metric })),
    ...e.tables.reference_levels.filter((r) => r.metric).map((r, i) => ({ where: `tables.reference_levels[${i}]`, id: r.metric! })),
  ];
  for (const r of refs) {
    if (!e.metrics[r.id]) add("FAIL", "source", r.where, `References metric "${r.id}", which is not in the edition (no source or as-of).`);
  }

  // FAIL: displayed number without source_url or as_of.
  for (const [id, m] of Object.entries(metrics)) {
    if (m.value == null) continue;
    if (!m.source_url || !/^https?:\/\//.test(m.source_url)) add("FAIL", "source", `metrics.${id}`, `Shows ${m.display} but has no source_url.`);
    if (!m.as_of) add("FAIL", "source", `metrics.${id}`, `Shows ${m.display} but has no as_of date.`);
    else if (!periodEnd(m.as_of)) add("FAIL", "source", `metrics.${id}`, `as_of "${m.as_of}" is not a date or period (YYYY-MM-DD, YYYY-MM, YYYY-Qn, YYYY-Hn, YYYY).`);
  }
  for (const [i, r] of e.tables.inventory.entries()) {
    if (!r.source_url) add("FAIL", "source", `tables.inventory[${i}]`, `${r.market} ${r.type} has no source_url.`);
  }

  // FAIL: arrow without a y/y basis or year-ago value. Also check frozen fields against the recomputation.
  for (const [id, raw] of Object.entries(known)) {
    const m = metrics[id];
    const hasReported = !!raw.change_reported && (raw.change_reported.pct != null || raw.change_reported.points != null);
    const shownDir = raw.direction !== undefined ? raw.direction : m.direction;
    if (shownDir != null) {
      const basis = raw.comparison_basis ?? m.comparison_basis;
      if (basis !== "y/y") add("FAIL", "arrow", `metrics.${id}`, `Arrow shown with comparison_basis "${basis}"; arrows must be y/y.`);
      if (raw.year_ago == null && !hasReported) add("FAIL", "arrow", `metrics.${id}`, "Arrow shown but year_ago is null and no reported y/y change.");
    }
    if (raw.direction !== undefined && raw.direction !== m.direction) {
      add("FAIL", "arrow", `metrics.${id}`, `Frozen direction "${raw.direction}" differs from computed "${m.direction}". Rebuild; never type arrows.`);
    }
    if (raw.color !== undefined && raw.color !== m.color) {
      add("FAIL", "arrow", `metrics.${id}`, `Frozen color "${raw.color}" differs from computed "${m.color}". Rebuild; never type colors.`);
    }
  }

  // FAIL: banned words in edition text and the draft summary.
  const texts = narrativeStrings(e);
  if (draftSummary) texts.push({ path: "draft summary", text: draftSummary });
  for (const t of texts) {
    for (const h of findBannedWords(t.text)) {
      if (h.allowed) add("INFO", "banned", t.path, `"${h.word}" allowed in "…${h.context}…". ${h.allowed}`);
      else add("FAIL", "banned", t.path, `Banned word "${h.word}": "…${h.context}…"`);
    }
  }

  // FAIL: numbers in the draft summary not present in the edition JSON (±0.05).
  if (draftSummary) {
    const pool = allNumbersInEdition(e, metrics).map(Math.abs);
    const text = draftSummary.replace(/\]\([^)]*\)/g, "]");
    const missing = new Set<string>();
    for (const n of numbersIn(text)) {
      const v = Math.abs(n.value);
      if (!pool.some((p) => Math.abs(p - v) <= 0.05 + 1e-9)) missing.add(n.raw.trim());
    }
    for (const raw of missing) add("FAIL", "draftNumbers", "draft summary", `Number ${raw} is not in the edition JSON (tolerance ±0.05).`);
  }

  // WARN: data older than max_age_days.
  const ref = input.today ?? periodEnd(e.data_as_of) ?? new Date();
  for (const [id, m] of Object.entries(metrics)) {
    if (m.value == null) continue;
    const end = periodEnd(m.as_of);
    if (!end) continue;
    const c = cfg.metrics[id];
    const max = c.max_age_days ?? cfg.defaults.max_age_days[c.frequency];
    const age = Math.floor((ref.getTime() - end.getTime()) / DAY_MS);
    if (max != null && age > max) {
      add("WARN", "freshness", `metrics.${id}`, `${m.label}: as of ${m.as_of} is ${age} days old at ${ref.toISOString().slice(0, 10)} (limit ${max} for ${c.frequency}${c.max_age_days ? ", per metric" : ""}).`);
    }
  }

  // WARN: stale / carried-forward flags written by the builder.
  for (const [id, raw] of Object.entries(known)) {
    if (raw.stale) add("WARN", "stale", `metrics.${id}`, `Not refreshed this month; previous value kept (as of ${metrics[id].as_of}).`);
    if (raw.carried_forward) add("INFO", "stale", `metrics.${id}`, `Carried forward by the owner: ${raw.carry_forward_reason ?? "(no reason)"}.`);
  }

  // WARN: change vs. the previous edition over 3× the typical monthly move.
  if (previous) {
    for (const [id, m] of Object.entries(metrics)) {
      const p = previous.metrics[id];
      const c = cfg.metrics[id];
      if (!p || m.value == null || p.value == null) continue;
      const cumulative = (s: string) => s.includes("/") || /-H[12]$/.test(s);
      if (cumulative(m.period) || cumulative(p.period)) continue; // YTD totals grow every month
      const step = Math.abs(m.value - p.value);
      if (step === 0) continue;
      let typical = c.typical_move ?? null;
      if (typical == null) {
        const yoy = [m.year_ago != null ? Math.abs(m.value - m.year_ago) : null, p.year_ago != null ? Math.abs(p.value - p.year_ago) : null]
          .filter((x): x is number => x != null);
        if (!yoy.length) continue;
        const t = c.flat_threshold ?? defaultFlatThreshold(c.unit);
        const floor = "points" in t ? t.points : t.relative * Math.abs(p.value);
        // Random-walk scaling: a 12-step (monthly) y/y change is about sqrt(12) typical single steps.
        typical = Math.max(Math.max(...yoy) / Math.sqrt(STEPS_PER_YEAR[c.frequency]), floor);
      }
      if (step > 3 * typical) {
        add("WARN", "bigMove", `metrics.${id}`, `${m.label}: ${p.value} (${p.period}) -> ${m.value} (${m.period}) moved ${round(step)} vs. a typical ${round(typical)} per edition. Possible entry error; check the source.`);
      }
    }
  }

  // WARN: the same metric shows different values in two places.
  const consistency = (where: string, text: string, value: number | null, what: string) => {
    if (value == null) return;
    const ok = textShowsValue(text, value);
    if (ok === false) add("WARN", "consistency", where, `"${text}" does not match ${what} ${value}.`);
  };
  for (const [id, m] of Object.entries(metrics)) {
    if (m.value != null) {
      if (textShowsValue(m.display, m.value) === null && m.display !== "—") {
        add("WARN", "consistency", `metrics.${id}.display`, `Display "${m.display}" shows no number for value ${m.value}.`);
      } else consistency(`metrics.${id}.display`, m.display, m.value, "value");
    }
    if (m.year_ago != null && m.year_ago_display) consistency(`metrics.${id}.year_ago_display`, m.year_ago_display, m.year_ago, "year_ago");
  }
  e.tables.key_indicators.forEach((r, i) => {
    const m = metrics[r.metric];
    if (!m) return;
    const where = `tables.key_indicators[${i}] (${r.metric})`;
    consistency(`${where}.latest`, r.latest.split(" (")[0], m.value, `${r.metric} value`);
    if (m.year_ago != null) consistency(`${where}.year_ago`, r.year_ago.split(" (")[0], m.year_ago, `${r.metric} year_ago`);
    if (m.ref_2019 && r.ref_2019 && m.ref_2019.trim() !== r.ref_2019.trim()) {
      add("WARN", "consistency", `${where}.ref_2019`, `"${r.ref_2019}" differs from metrics.${r.metric}.ref_2019 "${m.ref_2019}".`);
    }
  });
  e.tables.reference_levels.forEach((r, i) => {
    if (!r.metric || !metrics[r.metric]) return;
    const where = `tables.reference_levels[${i}] (${r.indicator})`;
    if (DERIVED_REFERENCE_ROWS[r.indicator]) {
      add("INFO", "consistency", where, `Not compared with ${r.metric}: ${DERIVED_REFERENCE_ROWS[r.indicator]}`);
      return;
    }
    consistency(`${where}.today`, r.today, metrics[r.metric].value, `${r.metric} value`);
  });
  e.asset_cards.forEach((a, i) => {
    const m = metrics[a.metric];
    if (!a.value_display || !m || m.value == null) return;
    // A card may headline the y/y change instead of the level (e.g. "+21%" for "H1 2026 vs. H1 2025").
    const candidates = [m.value, m.change_pct, m.change_abs].filter((x): x is number => x != null);
    if (candidates.some((v) => textShowsValue(a.value_display!, v))) return;
    add("WARN", "consistency", `asset_cards[${i}].value_display`, `"${a.value_display}" matches neither ${a.metric} value ${m.value} nor its y/y change.`);
  });
  for (const [g, tiles] of Object.entries(e.tiles)) {
    tiles.forEach((t, i) => {
      const m = metrics[t.metric];
      const ya = t.sub.match(/year ago\s+([−\-+]?[$~]?\d[\d,.]*)/i);
      if (m && ya) {
        if (m.year_ago == null) add("WARN", "consistency", `tiles.${g}[${i}].sub`, `Sub-line quotes "year ago ${ya[1]}" but ${t.metric} has no year_ago.`);
        else consistency(`tiles.${g}[${i}].sub`, ya[1], m.year_ago, `${t.metric} year_ago`);
      }
    });
  }

  // WARN: bullet link phrases that do not occur in their text.
  for (const b of bulletsWithLinks(e)) {
    for (const l of b.links) {
      if (!b.text.includes(l.phrase) && !(b.lead ?? "").includes(l.phrase)) {
        add("WARN", "linkPhrase", b.path, `Link phrase "${l.phrase}" is not in the text "${b.text}".`);
      }
    }
  }

  // WARN: source URLs missing from the registry.
  const registry = new Set(sources.map((s) => norm(s.url)));
  const used = new Map<string, string[]>();
  const addUrl = (url: string | null | undefined, where: string) => {
    if (!url) return;
    used.set(url, [...(used.get(url) ?? []), where]);
  };
  for (const [id, m] of Object.entries(metrics)) if (m.value != null) addUrl(m.source_url, `metrics.${id}`);
  for (const b of bulletsWithLinks(e)) for (const l of b.links) addUrl(l.url, b.path);
  e.tables.inventory.forEach((r, i) => addUrl(r.source_url, `tables.inventory[${i}]`));
  e.tables.metros.forEach((r, i) => addUrl(r.permits_url, `tables.metros[${i}]`));
  for (const [url, wheres] of used) {
    if (!registry.has(norm(url))) {
      add("WARN", "registry", wheres.slice(0, 3).join(", ") + (wheres.length > 3 ? ` (+${wheres.length - 3})` : ""), `${url} is not in data/config/sources.yaml.`);
    }
  }

  return F;
}

/** Every distinct URL the edition links to (for --check-links). */
export function editionUrls(e: EditionSeed, cfg: MetricsFile): string[] {
  const urls = new Set<string>();
  for (const [id, m] of Object.entries(e.metrics)) {
    const u = m.source_url ?? cfg.metrics[id]?.source_url;
    if (u) urls.add(u);
  }
  walk(e, "", (_p, key, v) => {
    if (isUrlKey(key) && typeof v === "string" && /^https?:\/\//.test(v)) urls.add(v);
  });
  return [...urls];
}

/** HEAD each URL (GET if HEAD is refused); WARN on anything but 2xx/3xx. */
export async function checkLinks(urls: string[], timeoutMs = 15000, concurrency = 8): Promise<Finding[]> {
  const out: Finding[] = [];
  const queue = [...urls];
  async function one(url: string) {
    const attempt = async (method: string) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        return await fetch(url, { method, redirect: "follow", signal: ctl.signal, headers: { "user-agent": "state-of-the-market-link-check" } });
      } finally {
        clearTimeout(t);
      }
    };
    try {
      let res = await attempt("HEAD");
      if ([403, 405, 501].includes(res.status)) res = await attempt("GET");
      if (res.status >= 400) out.push({ level: "WARN", rule: RULES.brokenLink, where: url, message: `HTTP ${res.status}` });
    } catch (err) {
      out.push({ level: "WARN", rule: RULES.brokenLink, where: url, message: `Request failed: ${(err as Error).message}` });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await one(queue.shift()!);
  }));
  return out;
}

// ---------------------------------------------------------------- report

export function renderReport(id: string, findings: Finding[], checks: string[]): string {
  const by = (l: Level) => findings.filter((f) => f.level === l);
  const fails = by("FAIL");
  const warns = by("WARN");
  const infos = by("INFO");
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const table = (fs: Finding[]) =>
    ["| Rule | Where | Detail |", "|---|---|---|", ...fs.map((f) => `| ${esc(f.rule)} | \`${esc(f.where)}\` | ${esc(f.message)} |`)].join("\n");
  const L = [
    `## Validation report: edition ${id}`,
    "",
    `**${fails.length ? "FAIL: publishing is blocked" : "PASS"}** · ${fails.length} FAIL · ${warns.length} WARN · ${infos.length} note(s)`,
    "",
  ];
  if (fails.length) L.push("### FAIL (must fix before publishing)", "", table(fails), "");
  if (warns.length) L.push("### WARN (review)", "", table(warns), "");
  if (infos.length) L.push("<details><summary>Notes: allow-listed matches and skipped comparisons</summary>", "", table(infos), "", "</details>", "");
  L.push("### Checks run", "", ...checks.map((c) => `- ${c}`), "");
  return L.join("\n");
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const norm = (u: string) => u.trim().replace(/\/+$/, "");
