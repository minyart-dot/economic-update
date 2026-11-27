// Builds the render-ready Edition from the seed JSON + configs + history.
// This is the computation that scripts/build-edition.ts (Phase 3) will freeze into the
// edition snapshot: y/y changes, direction, color, correlations, alert and references.

import { buildAlert } from "./alert";
import { computeCorrelations } from "./analytics";
import { CHARTS } from "./charts";
import { colorFor, computeChange } from "./compare";
import {
  loadEditionSeed,
  loadMetricsConfig,
  loadSections,
  loadSources,
  loadTexasAnnual,
  loadUsAnnual,
} from "./data";
import { formatValue, hostname } from "./format";
import type { Bullet, Edition, EditionSeed, Metric, MetricsFile, ReferenceGroup, SourceEntry } from "./types";

export function enrichMetrics(seed: EditionSeed, cfg: MetricsFile): Record<string, Metric> {
  const out: Record<string, Metric> = {};
  for (const [id, m] of Object.entries(seed.metrics)) {
    const c = cfg.metrics[id];
    if (!c) throw new Error(`Metric "${id}" is in the edition but not in data/config/metrics.yaml`);
    const ch = computeChange(m.value, m.year_ago, m.change_reported, c.unit, c.flat_threshold);
    const yaDisplay =
      m.year_ago_display ?? (m.year_ago != null ? formatValue(m.year_ago, c) : null);
    out[id] = {
      id,
      label: c.label,
      unit: c.unit,
      value: m.value,
      display: m.display ?? formatValue(m.value, c),
      period: m.period,
      period_label: m.period_label,
      year_ago: m.year_ago,
      year_ago_display: yaDisplay,
      year_ago_period: m.year_ago_period ?? null,
      change_abs: ch.change_abs,
      change_pct: ch.change_pct,
      direction: ch.direction,
      polarity: c.polarity,
      color: colorFor(ch.direction, c.polarity),
      comparison_basis: "y/y",
      ref_2019: m.ref_2019 ?? null,
      source_name: m.source_name ?? c.source_name,
      source_url: m.source_url ?? c.source_url,
      as_of: m.as_of ?? m.period,
      automation: c.automation,
      frequency: c.frequency,
      footnote: m.footnote ?? null,
      notes: m.notes ?? null,
      year_ago_revised: !!m.year_ago_revised,
      change_reported: m.change_reported ?? null,
    };
  }
  return out;
}

// --------------------------------------------------------------------------- references

function bulletUrls(bullets: Bullet[] | undefined): string[] {
  return (bullets ?? []).flatMap((b) => (b.links ?? []).map((l) => l.url));
}

/** Every source URL used, grouped by section (spec 6.16), in page order. */
function urlsBySection(seed: EditionSeed, metrics: Record<string, Metric>): Record<string, string[]> {
  const s = seed.sections;
  const m = (ids: string[]) => ids.map((id) => metrics[id]?.source_url).filter(Boolean) as string[];
  const chart = (...ids: string[]) => ids.flatMap((id) => CHARTS[id].sources);
  return {
    summary: [
      ...m(seed.tiles.headline.map((t) => t.metric)),
      ...seed.asset_cards.flatMap((a) => [...m([a.metric]), ...bulletUrls(a.bullets)]),
    ],
    "key-indicators": m(seed.tables.key_indicators.map((r) => r.metric)),
    story: [...seed.themes.flatMap((t) => bulletUrls(t.bullets)), ...chart("C15")],
    "twenty-year": [...bulletUrls(s["twenty-year"]?.c1_bullets), ...bulletUrls(s["twenty-year"]?.c2_bullets), ...chart("C1", "C2")],
    "jobs-ai": [...bulletUrls(s["jobs-ai"]?.bullets), ...chart("C3", "C4")],
    credit: [...bulletUrls(s.credit?.bullets), ...chart("C5", "C6")],
    rates: [...m(seed.tiles.rates.map((t) => t.metric)), ...bulletUrls(s.rates?.bullets)],
    gauges: [...m(seed.tiles.gauges.map((t) => t.metric)), ...bulletUrls(s.gauges?.bullets), ...chart("C17")],
    housing: [
      ...bulletUrls(s.housing?.permit_bullets),
      ...bulletUrls(s.housing?.sales_bullets),
      ...bulletUrls(s.housing?.mh_bullets),
      ...chart("C7", "C8"),
    ],
    inventory: [...bulletUrls(s.inventory?.bullets), ...seed.tables.inventory.map((r) => r.source_url), ...chart("C16")],
    cre: [
      ...m(seed.tiles.cre.map((t) => t.metric)),
      ...bulletUrls(s.cre?.bullets),
      ...bulletUrls(s.cre?.texas_bullets),
      ...chart("C9", "C10", "C11"),
    ],
    "tx-metros": [
      ...(seed.tables.metros.map((r) => r.permits_url).filter(Boolean) as string[]),
      ...bulletUrls(s["tx-metros"]?.bullets),
      ...chart("C12", "C13", "C14"),
    ],
    texas: [...m(seed.tiles.texas.map((t) => t.metric)), ...bulletUrls(s.texas?.bullets)],
    europe: bulletUrls(s.europe?.bullets),
    watch: m(seed.tables.reference_levels.map((r) => r.metric).filter(Boolean) as string[]),
  };
}

/** Pick a readable title for a URL from the registry (prefer named sources over bare figures). */
function titleFor(url: string, registry: SourceEntry[]): string {
  const phrases = registry.filter((r) => r.url === url).map((r) => r.phrase);
  const named = phrases
    .filter((p) => /^[A-Z]/.test(p) && !p.includes(":"))
    .sort((a, b) => (a.match(/\d/g)?.length ?? 0) - (b.match(/\d/g)?.length ?? 0));
  const domain = phrases.find((p) => /^[a-z0-9.-]+\.[a-z]+: /.test(p));
  return named[0] ?? domain ?? phrases[0] ?? hostname(url);
}

export function buildReferences(seed: EditionSeed, metrics: Record<string, Metric>): ReferenceGroup[] {
  const registry = loadSources();
  const sections = loadSections();
  const by = urlsBySection(seed, metrics);
  const seen = new Set<string>();
  const groups: ReferenceGroup[] = [];
  for (const sec of sections) {
    const urls = by[sec.id];
    if (!urls) continue;
    const items: { title: string; url: string }[] = [];
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      items.push({ title: titleFor(url, registry), url });
    }
    if (items.length) {
      groups.push({ section: sec.id, title: `${sec.number ? sec.number + " " : ""}${sec.title}`, items });
    }
  }
  const extra = registry
    .filter((r) => !seen.has(r.url))
    .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
    .map((r) => ({ title: titleFor(r.url, registry), url: r.url }));
  if (extra.length) groups.push({ section: "additional", title: "Additional sources linked in the text", items: extra });
  return groups;
}

// --------------------------------------------------------------------------- edition

export function getEdition(id: string): Edition {
  const seed = loadEditionSeed(id);
  const cfg = loadMetricsConfig();
  const metrics = enrichMetrics(seed, cfg);
  const vix = metrics.vix;
  if (vix?.value == null) throw new Error("Edition is missing the VIX value required for the alert banner");
  const alert = buildAlert(vix.value, vix.period_label, metrics.yield_curve?.value ?? null);
  return {
    ...seed,
    metrics,
    correlations: computeCorrelations(loadUsAnnual(), loadTexasAnnual()),
    alert,
    references: buildReferences(seed, metrics),
  };
}
