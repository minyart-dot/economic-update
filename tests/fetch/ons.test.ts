import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { FetchImpl } from "../../scripts/fetch/http";
import {
  computeOnsMetric,
  computeOnsRolling,
  ONS_MGSX_SOURCE_URL,
  parseOnsDate,
  parseOnsMonths,
  windowLabel,
  type OnsTimeSeries,
} from "../../scripts/fetch/ons";
import { runFetch } from "../../scripts/fetch/run";
import { fixture, noSleep, ROOT } from "./helpers";

const DATA = path.join(ROOT, "data");
const ts = () => JSON.parse(fixture("ons/mgsx.json")) as OnsTimeSeries;
const RECORD_KEYS = ["value", "period", "period_label", "year_ago", "year_ago_period", "as_of", "source_url", "stale", "error"];

describe("ONS MGSX: date parsing", () => {
  it("parses rolling 3-month windows by their first and last month", () => {
    assert.deepEqual(parseOnsDate("2026 JUL-SEP"), { start: "2026-07-01", end: "2026-09-01" });
    assert.deepEqual(parseOnsDate("2026 jul-sep"), { start: "2026-07-01", end: "2026-09-01" });
  });
  it("windows that cross the year end in the following year", () => {
    assert.deepEqual(parseOnsDate("2025 NOV-JAN"), { start: "2025-11-01", end: "2026-01-01" });
    assert.deepEqual(parseOnsDate("2025 DEC-FEB"), { start: "2025-12-01", end: "2026-02-01" });
  });
  it("accepts a single month and rejects quarters, years and junk", () => {
    assert.deepEqual(parseOnsDate("2026 SEP"), { start: "2026-09-01", end: "2026-09-01" });
    for (const d of ["2026 Q3", "2026", "2026 JUL-XYZ", ""]) assert.equal(parseOnsDate(d), null, d);
  });
  it("labels the whole window", () => {
    assert.equal(windowLabel({ start: "2026-07-01", end: "2026-09-01" }), "Jul–Sep");
    assert.equal(windowLabel({ start: "2025-11-01", end: "2026-01-01" }), "Nov–Jan");
    assert.equal(windowLabel({ start: "2026-09-01", end: "2026-09-01" }), "Sep");
  });
});

describe("ONS MGSX: parsing and computing (synthetic fixture)", () => {
  it("reads the months array oldest first, string values as numbers, missing as null", () => {
    const w = parseOnsMonths(ts());
    assert.equal(w.length, 15);
    assert.deepEqual(w[0], { start: "2025-05-01", end: "2025-07-01", value: 4.8 });
    assert.deepEqual(w[8], { start: "2026-01-01", end: "2026-03-01", value: null });
    assert.deepEqual(w.at(-1), { start: "2026-07-01", end: "2026-09-01", value: 4.6 });
  });

  it("reproduces the November 2026 edition: 4.6% for Jul–Sep 2026, y/y vs Jul–Sep 2025", () => {
    assert.deepEqual(computeOnsMetric(ts()), {
      value: 4.6,
      period: "2026-09",
      period_label: "Jul–Sep",
      year_ago: 5.0,
      year_ago_period: "2025-09",
      as_of: "2026-09",
    });
  });

  it("skips trailing unpublished values and never fills them", () => {
    const d = ts();
    d.months!.push({ date: "2026 AUG-OCT", value: "" }, { date: "2026 SEP-NOV", value: ".." });
    const c = computeOnsMetric(d);
    assert.equal(c.period, "2026-09");
    assert.equal(c.value, 4.6);
  });

  it("year-ago is null when that exact window is missing (no nearby window substituted)", () => {
    const w = parseOnsMonths(ts()).filter((x) => x.end !== "2025-09-01");
    const c = computeOnsRolling(w);
    assert.equal(c.year_ago, null);
    assert.equal(c.year_ago_period, null);
  });

  it("ignores numeric values and non-month rows gracefully", () => {
    const c = computeOnsMetric({ months: [{ date: "2025 JUL-SEP", value: 5 }, { date: "2026 Q3", value: "9.9" }, { date: "2026 JUL-SEP", value: 4.6 }] });
    assert.deepEqual([c.value, c.year_ago, c.period_label], [4.6, 5, "Jul–Sep"]);
  });

  it("rejects responses without months, with only missing values, or out of order", () => {
    assert.throws(() => parseOnsMonths({} as OnsTimeSeries), /no months array/);
    assert.throws(() => parseOnsMonths({ months: [] }), /no monthly observations/);
    assert.throws(() => computeOnsMetric({ months: [{ date: "2026 JUL-SEP", value: "" }] }), /no observations with a value/);
    assert.throws(
      () => parseOnsMonths({ months: [{ date: "2026 JUL-SEP", value: "4.6" }, { date: "2026 JUN-AUG", value: "4.6" }] }),
      /out of order/,
    );
  });
});

describe("runFetch: uk_unemployment", () => {
  const onsOnly: FetchImpl = async (url) => {
    const ok = new URL(url).hostname === "www.ons.gov.uk";
    return { ok, status: ok ? 200 : 404, statusText: ok ? "OK" : "Not Found", text: async () => (ok ? fixture("ons/mgsx.json") : "not found") };
  };

  it("is fetched from ONS and saved for the audit trail", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-ons-"));
    const file = await runFetch({ edition: "2026-11", dataDir: DATA, outDir, env: {}, http: { fetchImpl: onsOnly, sleep: noSleep } });
    const r = file.metrics.uk_unemployment;
    assert.deepEqual(Object.keys(r), RECORD_KEYS);
    assert.deepEqual(r, {
      value: 4.6,
      period: "2026-09",
      period_label: "Jul–Sep",
      year_ago: 5.0,
      year_ago_period: "2025-09",
      as_of: "2026-09",
      source_url: ONS_MGSX_SOURCE_URL,
      stale: false,
      error: null,
    });
    assert.ok(fs.existsSync(path.join(outDir, "ons", "mgsx.json")));
  });

  it("falls back to the latest edition's value, marked stale, when the fetch fails", async () => {
    const failing = { fetchImpl: async () => Promise.reject(new Error("network down")), sleep: noSleep };
    const file = await runFetch({ edition: "2026-12", dataDir: DATA, env: {}, http: failing, write: false });
    const r = file.metrics.uk_unemployment;
    assert.equal(r.stale, true);
    assert.match(r.error!, /network down/);
    assert.doesNotMatch(r.error!, /No automated fetcher/);
    assert.equal(r.value, 4.6);
    assert.equal(r.period, "2026-Q3");
    assert.equal(r.period_label, "Q3");
    assert.equal(r.year_ago, null);
  });
});
