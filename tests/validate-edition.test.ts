import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { EditionSeed, MetricsFile } from "../lib/types";
import { buildEdition } from "../scripts/lib/build";
import { loadEditionAt, loadMetricsConfigAt, loadSourcesAt } from "../scripts/lib/io";
import {
  RULES,
  checkLinks,
  findBannedWords,
  numbersIn,
  renderReport,
  validateEdition,
  type Finding,
  type ValidateInput,
} from "../scripts/lib/validate";
import { FIXTURE, clone } from "./helpers";

// Base case: the synthetic 2030-02 edition built from the fixture (frozen format).
const BASE = buildEdition({ root: FIXTURE, id: "2030-02", now: new Date("2030-02-26T00:00:00Z") }).edition!;
const CFG = loadMetricsConfigAt(FIXTURE);
const SOURCES = loadSourcesAt(FIXTURE);
const PREV = loadEditionAt(FIXTURE, "2030-01");

function run(mut: (e: EditionSeed, cfg: MetricsFile) => void = () => {}, extra: Partial<ValidateInput> = {}): Finding[] {
  const e = clone(BASE);
  const cfg = clone(CFG);
  mut(e, cfg);
  return validateEdition({ edition: e, cfg, sources: SOURCES, previous: PREV, ...extra });
}
const of = (fs: Finding[], rule: keyof typeof RULES, level: Finding["level"]) => fs.filter((f) => f.rule === RULES[rule] && f.level === level);

test("base synthetic edition has no FAIL", () => {
  assert.deepEqual(of(run(), "source", "FAIL").concat(of(run(), "arrow", "FAIL"), of(run(), "banned", "FAIL")), []);
});

test("FAIL: displayed number without source_url or as_of", () => {
  assert.equal(of(run(), "source", "FAIL").length, 0);
  const noUrl = run((e, cfg) => {
    delete e.metrics.rate_a.source_url;
    cfg.metrics.rate_a.source_url = "";
  });
  assert.ok(of(noUrl, "source", "FAIL").some((f) => f.where === "metrics.rate_a" && f.message.includes("source_url")));
  const badAsOf = run((e) => {
    e.metrics.price_b.as_of = "soon";
  });
  assert.ok(of(badAsOf, "source", "FAIL").some((f) => f.where === "metrics.price_b" && f.message.includes("as_of")));
  const missingRef = run((e) => {
    e.tiles.headline.push({ metric: "nope", sub: "", tone: "teal" });
  });
  assert.ok(of(missingRef, "source", "FAIL").some((f) => f.message.includes('"nope"')));
});

test("FAIL: arrow without y/y basis, without year-ago, or typed by hand", () => {
  assert.equal(of(run(), "arrow", "FAIL").length, 0);
  const noYearAgo = run((e) => {
    e.metrics.rate_a.year_ago = null; // frozen direction "down" stays -> arrow with no year-ago
  });
  assert.ok(of(noYearAgo, "arrow", "FAIL").some((f) => f.message.includes("year_ago is null")));
  const mm = run((e) => {
    e.metrics.rate_a.comparison_basis = "m/m";
  });
  assert.ok(of(mm, "arrow", "FAIL").some((f) => f.message.includes('"m/m"')));
  const typed = run((e) => {
    e.metrics.price_b.color = "good"; // mixed polarity is always neutral
  });
  assert.ok(of(typed, "arrow", "FAIL").some((f) => f.where === "metrics.price_b" && f.message.includes("Frozen color")));
  // A reported y/y change justifies an arrow without a year-ago level.
  assert.equal(of(run(), "arrow", "FAIL").filter((f) => f.where === "metrics.change_g").length, 0);
});

test("FAIL: draft summary numbers must exist in the edition (±0.05)", () => {
  const ok = run(undefined, { draftSummary: "Rate A fell to 4.0% in Jan from 5.0%; price B was $110. Index C 40." });
  assert.equal(of(ok, "draftNumbers", "FAIL").length, 0);
  const near = run(undefined, { draftSummary: "Rate A 4.04%." });
  assert.equal(of(near, "draftNumbers", "FAIL").length, 0, "within tolerance");
  const bad = run(undefined, { draftSummary: "Rate A fell to 3.7% in Jan. See [source](https://example.com/9999)." });
  const fails = of(bad, "draftNumbers", "FAIL");
  assert.equal(fails.length, 1);
  assert.ok(fails[0].message.includes("3.7"));
});

test("FAIL: banned forecast words, with negations/definitions and quoted titles allowed", () => {
  // Base contains "Data only; no forecast." twice: allowed with an explanation.
  const base = run();
  assert.equal(of(base, "banned", "FAIL").length, 0);
  assert.ok(of(base, "banned", "INFO").some((f) => f.message.includes("Negation")));
  const vixDef = run((e) => {
    e.tables.gauge_explainer.push({ gauge: "VIX", measures: "Expected S&P 500 swings over the next 30 days", levels: "", why: "" });
  });
  assert.equal(of(vixDef, "banned", "FAIL").length, 0);

  const bad = run((e) => {
    e.themes[0].bullets[0].text = "Rate A will keep falling.";
  });
  assert.ok(of(bad, "banned", "FAIL").some((f) => f.where === "themes[0].bullets[0].text" && f.message.includes('"will"')));
  const draft = run(undefined, { draftSummary: "Investors should buy now; prices are likely to rise." });
  const words = of(draft, "banned", "FAIL").map((f) => f.message);
  assert.ok(words.some((w) => w.includes('"should buy"')));
  assert.ok(words.some((w) => w.includes('"likely"')));
  const expectedRates = run((e) => {
    e.big_picture = "Markets expect rate cuts.";
  });
  assert.equal(of(expectedRates, "banned", "FAIL").length, 1, "the VIX allow-list does not cover other uses of expect");
});

test("banned words: quoted source titles and URLs are excluded", () => {
  assert.deepEqual(findBannedWords('Per the report "Will rates fall?" (Example News).').filter((h) => !h.allowed), []);
  assert.deepEqual(findBannedWords("See https://example.com/stock-crash-forecast for data.").filter((h) => !h.allowed), []);
  assert.equal(findBannedWords("A housing bubble.").length, 1);
  assert.equal(findBannedWords("A real opportunity.").length, 1);
});

test("WARN: data older than max_age_days", () => {
  assert.equal(of(run(), "freshness", "WARN").filter((f) => f.where === "metrics.rate_a").length, 0);
  const old = run((e) => {
    e.metrics.rate_a.as_of = "2029-10";
  });
  assert.ok(of(old, "freshness", "WARN").some((f) => f.where === "metrics.rate_a" && f.message.includes("limit 45")));
  // A per-metric max_age_days overrides the frequency default
  const lenient = run((e, cfg) => {
    e.metrics.rate_a.as_of = "2029-10";
    cfg.metrics.rate_a.max_age_days = 200;
  });
  assert.equal(of(lenient, "freshness", "WARN").filter((f) => f.where === "metrics.rate_a").length, 0);
});

test("WARN: change over 3x the typical monthly move vs. the previous edition", () => {
  // rate_a 5.0 -> 4.0 with y/y moves of 1.0: typical 1.0/sqrt(12) ≈ 0.29 per edition, so 1.0 is > 3x.
  assert.ok(of(run(), "bigMove", "WARN").some((f) => f.where === "metrics.rate_a"));
  // index_c: 45 -> 46 with y/y moves 7 and 4: typical 7/sqrt(12) ≈ 2, step 1 < 3x
  const small = run((e) => {
    e.metrics.index_c.value = 46;
  });
  assert.equal(of(small, "bigMove", "WARN").filter((f) => f.where === "metrics.index_c").length, 0);
  // config typical_move overrides the heuristic
  const tuned = run((_e, cfg) => {
    cfg.metrics.rate_a.typical_move = 0.5;
  });
  assert.equal(of(tuned, "bigMove", "WARN").filter((f) => f.where === "metrics.rate_a").length, 0);
});

test("WARN: the same metric shows different values in two places", () => {
  const ok = run((e) => {
    e.tiles.headline[0].sub = "Jan · year ago 5.0%";
    e.tables.reference_levels[0].today = "4.0%";
  });
  assert.equal(of(ok, "consistency", "WARN").length, 0);
  const table = run((e) => {
    e.tables.key_indicators[0].latest = "4.3% (Jan)";
  });
  assert.ok(of(table, "consistency", "WARN").some((f) => f.where.includes("key_indicators[0]") && f.where.endsWith(".latest")));
  const display = run((e) => {
    e.metrics.price_b.display = "$100"; // value is 110
  });
  assert.ok(of(display, "consistency", "WARN").some((f) => f.where === "metrics.price_b.display"));
  const ref = run((e) => {
    e.tables.reference_levels[0].today = "5.0%";
  });
  assert.ok(of(ref, "consistency", "WARN").some((f) => f.where.includes("reference_levels[0]")));
});

test("WARN: bullet link phrase missing from its text", () => {
  assert.equal(of(run(), "linkPhrase", "WARN").length, 0);
  const bad = run((e) => {
    e.themes[0].bullets[0].links![0].phrase = "4.0 percent";
  });
  assert.ok(of(bad, "linkPhrase", "WARN").some((f) => f.where === "themes[0].bullets[0]"));
});

test("WARN: source URL not in sources.yaml", () => {
  assert.equal(of(run(), "registry", "WARN").length, 0);
  const bad = run((e) => {
    e.metrics.rate_a.source_url = "https://example.org/unregistered";
  });
  assert.ok(of(bad, "registry", "WARN").some((f) => f.message.includes("example.org/unregistered")));
});

test("WARN: broken links (local server, no internet)", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/ok") res.writeHead(200).end("ok");
    else if (req.url === "/moved") res.writeHead(301, { location: "/ok" }).end();
    else if (req.url === "/nohead" && req.method === "HEAD") res.writeHead(405).end();
    else if (req.url === "/nohead") res.writeHead(200).end("ok");
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const f = await checkLinks([`${base}/ok`, `${base}/moved`, `${base}/nohead`, `${base}/gone`], 5000);
    assert.equal(f.length, 1);
    assert.equal(f[0].where, `${base}/gone`);
    assert.match(f[0].message, /404/);
  } finally {
    server.close();
  }
});

test("numbersIn parses formatted numbers", () => {
  assert.deepEqual(numbersIn("$416,700 (+0.4%) −8.8% 1.295M 16-year 2025–26").map((n) => n.value), [416700, 0.4, -8.8, 1.295, 16, 2025, 26]);
});

test("report: Markdown with counts; PASS/FAIL headline", () => {
  const md = renderReport("2030-02", run(), ["check A"]);
  assert.match(md, /## Validation report: edition 2030-02/);
  assert.match(md, /\*\*PASS\*\*/);
  const failing = renderReport("2030-02", run(undefined, { draftSummary: "It will rise." }), []);
  assert.match(failing, /FAIL: publishing is blocked/);
});

test("the real November 2026 edition validates with no FAIL", () => {
  const root = process.cwd();
  const findings = validateEdition({
    edition: loadEditionAt(root, "2026-11"),
    cfg: loadMetricsConfigAt(root),
    sources: loadSourcesAt(root),
  });
  assert.deepEqual(findings.filter((f) => f.level === "FAIL"), []);
  // Its legitimate "no forecast" disclaimer and the VIX definition are allow-listed, not hidden.
  const allowed = findings.filter((f) => f.rule === RULES.banned && f.level === "INFO").map((f) => f.where);
  assert.ok(allowed.includes("notes.comparisons"));
  assert.ok(allowed.some((w) => w.startsWith("tables.gauge_explainer")));
});
