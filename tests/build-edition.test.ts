import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { enrichMetrics } from "../lib/edition";
import type { EditionSeed } from "../lib/types";
import { buildEdition } from "../scripts/lib/build";
import { loadMetricsConfigAt, loadSourcesAt } from "../scripts/lib/io";
import { validateEdition } from "../scripts/lib/validate";
import { FIXTURE, tempFixture, writeFile } from "./helpers";

const NOW = new Date("2030-02-26T09:00:00Z");

test("build: merges auto + manual + previous edition and freezes computed fields", () => {
  const res = buildEdition({ root: FIXTURE, id: "2030-02", now: NOW });
  assert.equal(res.ok, true, res.errors.join("\n"));
  const e = res.edition!;
  const m = e.metrics;

  assert.equal(e.status, "draft");
  assert.equal(e.edition_label, "February 2030");
  assert.equal(e.data_as_of, "2030-02-25");
  assert.equal((e as unknown as Record<string, unknown>).newsletter_sent_at, undefined, "never copy newsletter_sent_at");

  // AUTO, lower_is_good, value fell -> down / good
  assert.equal(m.rate_a.value, 4.0);
  assert.equal(m.rate_a.direction, "down");
  assert.equal(m.rate_a.color, "good");
  assert.equal(m.rate_a.change_abs, -1);
  assert.equal(m.rate_a.comparison_basis, "y/y");
  assert.equal(m.rate_a.as_of, "2030-01");
  assert.equal(m.rate_a.automation, "AUTO");
  assert.equal(m.rate_a.source_name, "Example API");
  assert.equal(res.sources.rate_a, "auto");

  // AUTO, mixed polarity -> always neutral
  assert.equal(m.price_b.direction, "up");
  assert.equal(m.price_b.color, "neutral");
  assert.equal(m.price_b.polarity, "mixed");

  // MANUAL, higher_is_good, fell -> down / bad
  assert.equal(m.index_c.value, 40);
  assert.equal(m.index_c.direction, "down");
  assert.equal(m.index_c.color, "bad");
  assert.equal(res.sources.index_c, "manual");

  // Reported change only (no year-ago level): arrow from change_reported; old display text dropped
  assert.equal(m.change_g.direction, "up");
  assert.equal(m.change_g.color, "bad");
  assert.equal(m.change_g.display, "$1,530");
  assert.ok(res.needsReview.some((r) => r.includes("change_g") && r.includes("$1,500/mo")));

  // Carried forward by the owner: original as-of kept, flagged
  assert.equal(res.sources.level_e, "carried_forward");
  assert.equal(m.level_e.as_of, "2029-Q3");
  assert.equal(m.level_e.carried_forward, true);
  assert.match(m.level_e.carry_forward_reason!, /quarterly source/);

  // Not required, not refreshed: kept with original as-of, marked stale, warned
  assert.equal(m.count_d.stale, true);
  assert.equal(m.auto_f.stale, true);
  assert.equal(m.auto_f.as_of, "2029-12");
  assert.ok(res.warnings.some((w) => w.includes("auto_f") && w.includes("HTTP 503")));

  // Frozen fields equal what the page's loader computes (lib/edition.ts enrichMetrics)
  const cfg = loadMetricsConfigAt(FIXTURE);
  const page = enrichMetrics(e, cfg);
  for (const id of Object.keys(m)) {
    assert.equal(m[id].direction, page[id].direction, id);
    assert.equal(m[id].color, page[id].color, id);
    assert.equal(m[id].change_pct, page[id].change_pct, id);
  }

  // Key-indicator cells regenerated for changed metrics; narrative copied and listed for review
  assert.equal(e.tables.key_indicators[0].latest, "4.0% (Jan)");
  assert.equal(e.tables.key_indicators[0].year_ago, "5.0%");
  assert.equal(e.month_in_brief, "SYNTHETIC brief. Rate A was 5.0%. Data only; no forecast.");
  assert.ok(res.needsReview.some((r) => r.startsWith("headline_summary, month_in_brief, big_picture")));
  assert.ok(res.needsReview.some((r) => r.includes("index_c") && r.includes("notes copied")));
  assert.equal(e.build?.previous_edition, "2030-01");
});

test("build: the frozen edition passes the validator (no FAIL)", () => {
  const res = buildEdition({ root: FIXTURE, id: "2030-02", now: NOW });
  const findings = validateEdition({
    edition: res.edition!,
    cfg: loadMetricsConfigAt(FIXTURE),
    sources: loadSourcesAt(FIXTURE),
    previous: JSON.parse(fs.readFileSync(path.join(FIXTURE, "data/editions/2030-01.json"), "utf8")) as EditionSeed,
  });
  assert.deepEqual(findings.filter((f) => f.level === "FAIL"), []);
  // The copied tile sub-line still quotes the old year-ago value: caught as a consistency WARN.
  assert.ok(findings.some((f) => f.level === "WARN" && f.where === "tiles.headline[0].sub"));
});

test("build: fails when a required manual value is still stale", () => {
  const root = tempFixture();
  const file = path.join(root, "data/manual/2030-02.yaml");
  const yaml = fs.readFileSync(file, "utf8").replace(/index_c:\n    required: true\n    stale: false/, "index_c:\n    required: true\n    stale: true");
  fs.writeFileSync(file, yaml);
  const res = buildEdition({ root, id: "2030-02", now: NOW });
  assert.equal(res.ok, false);
  assert.equal(res.edition, null);
  assert.ok(res.errors.some((e) => e.includes("index_c") && e.includes("required") && e.includes("carry_forward")));

  // --draft turns it into a warning and keeps the previous value
  const draft = buildEdition({ root, id: "2030-02", now: NOW, draft: true });
  assert.equal(draft.ok, true);
  assert.equal(draft.edition!.metrics.index_c.value, 45);
  assert.equal(draft.edition!.metrics.index_c.stale, true);
  assert.ok(draft.warnings.some((w) => w.includes("index_c") && w.includes("draft mode")));
});

test("build: carry_forward without a reason does not count", () => {
  const root = tempFixture();
  const file = path.join(root, "data/manual/2030-02.yaml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/carry_forward_reason: "Synthetic[^"]*"/, 'carry_forward_reason: ""'));
  const res = buildEdition({ root, id: "2030-02", now: NOW });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("level_e") && e.includes("carry_forward_reason is empty")));
});

test("build: a stale required AUTO metric fails unless the manual file supplies it", () => {
  const root = tempFixture();
  const autoPath = path.join(root, "data/raw/2030-02/auto.json");
  const auto = JSON.parse(fs.readFileSync(autoPath, "utf8"));
  auto.metrics.rate_a.stale = true;
  writeFile(root, "data/raw/2030-02/auto.json", JSON.stringify(auto));
  assert.equal(buildEdition({ root, id: "2030-02", now: NOW }).ok, false);

  const manual = fs.readFileSync(path.join(root, "data/manual/2030-02.yaml"), "utf8");
  writeFile(
    root,
    "data/manual/2030-02.yaml",
    manual +
      `  rate_a:\n    stale: false\n    value: 4.2\n    period: "2030-01"\n    period_label: "Jan"\n    year_ago: 4.1\n    year_ago_period: "2029-01"\n    as_of: "2030-01"\n    source_url: "https://example.com/rate-a"\n`,
  );
  const res = buildEdition({ root, id: "2030-02", now: NOW });
  assert.equal(res.ok, true, res.errors.join("\n"));
  assert.equal(res.edition!.metrics.rate_a.value, 4.2);
  assert.equal(res.edition!.metrics.rate_a.direction, "up");
  assert.equal(res.edition!.metrics.rate_a.color, "bad");
});

test("build: missing manual file fails (unless --draft)", () => {
  const root = tempFixture();
  fs.rmSync(path.join(root, "data/manual/2030-02.yaml"));
  const res = buildEdition({ root, id: "2030-02", now: NOW });
  assert.equal(res.ok, false);
  assert.ok(res.errors[0].includes("npm run manual-template -- 2030-02"));
});

test("build: rebuilding a frozen edition is stable (frozen format loads like the seed format)", () => {
  const root = tempFixture();
  const first = buildEdition({ root, id: "2030-02", now: NOW });
  writeFile(root, "data/editions/2030-02.json", JSON.stringify(first.edition));
  // Next month with no new data at all: everything is carried from the frozen 2030-02 snapshot.
  writeFile(root, "data/manual/2030-03.yaml", "metrics: {}\n");
  const next = buildEdition({ root, id: "2030-03", now: NOW, draft: true });
  assert.equal(next.ok, true, next.errors.join("\n"));
  const cfg = loadMetricsConfigAt(root);
  const a = enrichMetrics(first.edition!, cfg);
  const b = enrichMetrics(next.edition!, cfg);
  for (const id of Object.keys(a)) assert.deepEqual(b[id], a[id], id);
});

test("build: keeps display and notes supplied by a fetcher (e.g. fed funds range, payrolls average)", () => {
  const root = tempFixture();
  const autoPath = path.join(root, "data/raw/2030-02/auto.json");
  const auto = JSON.parse(fs.readFileSync(autoPath, "utf8"));
  auto.metrics.rate_a.display = "3.75–4.00%";
  auto.metrics.rate_a.year_ago_display = "4.00–4.25%";
  auto.metrics.rate_a.notes = "Prior 12-month average 48,000.";
  writeFile(root, "data/raw/2030-02/auto.json", JSON.stringify(auto));
  const res = buildEdition({ root, id: "2030-02", now: NOW });
  assert.equal(res.ok, true, res.errors.join("\n"));
  const m = res.edition!.metrics.rate_a;
  assert.equal(m.display, "3.75–4.00%");
  assert.equal(m.year_ago_display, "4.00–4.25%");
  assert.equal(m.notes, "Prior 12-month average 48,000.");
  assert.ok(!res.needsReview.some((r) => r.includes("rate_a") && r.includes("notes copied")), "fresh notes are not flagged as copied");
});
