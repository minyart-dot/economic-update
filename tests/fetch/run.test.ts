import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { load as yamlLoad } from "js-yaml";
import type { MetricsFile } from "../../lib/types";
import { runFetch } from "../../scripts/fetch/run";
import type { AutoFile, AutoRecord } from "../../scripts/fetch/types";
import { fixtureFetch, noSleep, ROOT } from "./helpers";

const DATA = path.join(ROOT, "data");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sotm-fetch-"));
const edition = JSON.parse(fs.readFileSync(path.join(DATA, "editions", "2026-11.json"), "utf8")) as {
  metrics: Record<string, { value: number | null; year_ago: number | null; period: string; year_ago_period?: string; display?: string }>;
};
const config = yamlLoad(fs.readFileSync(path.join(DATA, "config", "metrics.yaml"), "utf8")) as MetricsFile;

const RECORD_KEYS = ["value", "period", "period_label", "year_ago", "year_ago_period", "as_of", "source_url", "stale", "error"];
const PERIOD_RE = /^(\d{4}-\d{2}|\d{4}-\d{2}-\d{2}|\d{4}-Q[1-4]|\d{4}-\d{2}\/\d{4}-\d{2})$/;

function assertShape(file: AutoFile, ed: string) {
  assert.deepEqual(Object.keys(file).slice(0, 3), ["generated_at", "edition", "metrics"]);
  assert.equal(file.edition, ed);
  assert.ok(!Number.isNaN(Date.parse(file.generated_at)));
  for (const [id, r] of Object.entries({ ...file.metrics, ...file.extras })) {
    assert.deepEqual(Object.keys(r).slice(0, RECORD_KEYS.length), RECORD_KEYS, id);
    assert.ok(r.value === null || typeof r.value === "number", id);
    assert.ok(r.year_ago === null || typeof r.year_ago === "number", id);
    assert.equal(typeof r.stale, "boolean", id);
    assert.ok(r.error === null || typeof r.error === "string", id);
    assert.equal(r.stale, r.error !== null, `${id}: stale iff error`);
    if (r.value !== null) assert.match(r.period, PERIOD_RE, id);
    if (r.year_ago !== null) assert.match(r.year_ago_period ?? "", PERIOD_RE, id);
    else assert.equal(r.year_ago_period, null, id);
  }
}

describe("runFetch: acceptance against the November 2026 edition (synthetic FRED-shaped fixtures)", async () => {
  const outDir = tmp();
  const file = await runFetch({
    edition: "2026-11",
    dataDir: DATA,
    outDir,
    env: { FRED_API_KEY: "test-key", APARTMENTLIST_CSV_URL: "https://static.apartmentlist.com/test.csv" },
    http: { fetchImpl: fixtureFetch(), sleep: noSleep },
    now: new Date("2026-11-25T14:00:00Z"),
  });
  const m = file.metrics;
  const round = (id: string, x: number | null) => {
    if (x === null) return null;
    const d = config.metrics[id].decimals ?? 2;
    return Math.round(x * 10 ** d) / 10 ** d;
  };
  const expectEdition = (id: string, opts: { yearAgo?: boolean; period?: boolean } = {}) => {
    const r = m[id];
    const e = edition.metrics[id];
    assert.equal(r.stale, false, `${id} should be fresh: ${r.error}`);
    assert.equal(round(id, r.value), round(id, e.value), `${id} value`);
    if (opts.yearAgo ?? e.year_ago !== null) {
      assert.equal(round(id, r.year_ago), round(id, e.year_ago), `${id} year_ago`);
    }
    if (opts.period) {
      assert.equal(r.period, e.period, `${id} period`);
      if (e.year_ago !== null) assert.equal(r.year_ago_period, e.year_ago_period, `${id} year_ago_period`);
    }
  };

  it("unemployment 4.1 vs 4.4 (Oct 2025 not collected, Sep 2025 used)", () => {
    expectEdition("unemployment", { period: true });
    assert.deepEqual(m.unemployment, {
      value: 4.1,
      period: "2026-10",
      period_label: "Oct",
      year_ago: 4.4,
      year_ago_period: "2025-09",
      as_of: "2026-10",
      source_url: "https://fred.stlouisfed.org/series/UNRATE",
      stale: false,
      error: null,
    });
  });
  it("mortgage30 7.28 vs 6.26 (Nov 19 vs Nov 20, 2025)", () => expectEdition("mortgage30", { period: true }));
  it("job_openings 7.5M vs 7.2M", () => expectEdition("job_openings", { period: true }));
  it("CPI 3.7% vs 3.0% (Sep; no Oct y/y possible)", () => expectEdition("cpi_yoy", { period: true }));
  it("core and energy CPI", () => {
    expectEdition("core_cpi_yoy", { period: true });
    expectEdition("energy_cpi_yoy", { period: true });
  });
  it("fed funds 3.75–4.00% both years", () => {
    expectEdition("fed_funds");
    assert.equal(m.fed_funds.display, edition.metrics.fed_funds.display);
    assert.equal(m.fed_funds.year_ago_display, "3.75–4.00%");
    assert.equal(m.fed_funds.period, "2026-11-20");
  });
  it("permits: U.S. 1.295M vs 1.418M, single-family 772,000, Texas YTD 147,854 vs 163,525", () => {
    expectEdition("permits_us", { period: true });
    expectEdition("permits_us_single_family", { period: true });
    expectEdition("permits_texas_ytd", { period: true });
    assert.equal(m.permits_texas_ytd.period_label, "Jan–Sep");
  });
  it("claims, sentiment, job search, card charge-offs, manufactured home price", () => {
    for (const id of ["initial_claims", "continuing_claims", "consumer_sentiment", "avg_weeks_unemployed", "mh_avg_new_price"]) expectEdition(id);
    expectEdition("card_chargeoff", { period: true });
  });
  it("10-year Treasury and junk spread", () => {
    expectEdition("treasury10");
    expectEdition("junk_spread");
  });
  it("Eurostat and Apartment List metrics", () => {
    expectEdition("euro_unemployment", { period: true, yearAgo: false });
    expectEdition("eu_youth_unemployment", { period: true, yearAgo: false });
    expectEdition("us_median_rent", { period: true, yearAgo: false });
  });
  it("Texas metro rents in extras match the edition's metro table", () => {
    assert.equal(file.extras.rent_dallas_fw.value, 1413);
    assert.equal(file.extras.rent_houston.value, 1330);
    assert.equal(file.extras.rent_austin.value, 1296);
    assert.equal(file.extras.rent_san_antonio.value, 1140);
  });
  it("series without a fixture fall back to the edition value, marked stale", () => {
    assert.equal(m.vix.stale, true);
    assert.match(m.vix.error!, /FRED VIXCLS: Bad Request/);
    assert.equal(m.vix.value, edition.metrics.vix.value);
    assert.equal(file.extras.permits_ytd_houston.stale, true);
    assert.equal(file.extras.permits_ytd_houston.value, null);
  });
  it("AUTO metrics without a fetcher are listed as stale, MANUAL metrics are not listed", () => {
    for (const [id, r] of Object.entries(m)) if (/No automated fetcher/.test(r.error ?? "")) assert.equal(r.stale, true, id);
    assert.equal(m.existing_home_sales, undefined);
  });
  it("payrolls_change +165,000 from PAYEMS with the prior 12-month average in notes", () => {
    expectEdition("payrolls_change", { period: true });
    assert.equal(m.payrolls_change.display, edition.metrics.payrolls_change.display);
    assert.equal(m.payrolls_change.notes, "Prior 12-month average 48,000.");
    assert.equal(m.payrolls_change.year_ago, null);
  });
  it("writes auto.json and the raw responses, with no API key in them", () => {
    const written = JSON.parse(fs.readFileSync(path.join(outDir, "auto.json"), "utf8"));
    assert.deepEqual(written, file);
    assertShape(written, "2026-11");
    assert.ok(fs.existsSync(path.join(outDir, "fred", "UNRATE.json")));
    assert.ok(fs.existsSync(path.join(outDir, "eurostat", "une_rt_m.json")));
    assert.ok(fs.existsSync(path.join(outDir, "apartmentlist", "rent_estimates.csv")));
    assert.ok(!fs.readFileSync(path.join(outDir, "auto.json"), "utf8").includes("test-key"));
  });
});

describe("runFetch: failures never fail the run (spec 12.4)", () => {
  const failing = { fetchImpl: async () => Promise.reject(new Error("network down")), sleep: noSleep };

  it("keeps the latest edition's values, marked stale with the error", async () => {
    const file = await runFetch({ edition: "2026-12", dataDir: DATA, env: {}, http: failing, write: false });
    assertShape(file, "2026-12");
    const all: AutoRecord[] = Object.values(file.metrics);
    assert.ok(all.length > 0 && all.every((r) => r.stale));
    const u = file.metrics.unemployment;
    assert.equal(u.value, 4.1);
    assert.equal(u.year_ago, 4.4);
    assert.equal(u.period, "2026-10");
    assert.equal(u.error, "FRED_API_KEY is not set");
    assert.equal(file.metrics.fed_funds.display, "3.75–4.00%");
    assert.match(file.metrics.euro_unemployment.error!, /network down/);
    assert.equal(file.metrics.euro_unemployment.value, 6.5);
  });

  it("with a key but a failing network, the error is recorded without the key", async () => {
    const file = await runFetch({ edition: "2026-12", dataDir: DATA, env: { FRED_API_KEY: "SECRET" }, http: failing, write: false });
    const e = file.metrics.mortgage30.error!;
    assert.match(e, /network down/);
    assert.ok(!e.includes("SECRET"));
    assert.equal(file.metrics.mortgage30.value, 7.28);
  });

  it("uses null (never an estimate) when no edition has the metric", async () => {
    const empty = tmp();
    const file = await runFetch({ edition: "2026-12", dataDir: DATA, editionsDir: empty, env: {}, http: failing, write: false });
    const u = file.metrics.unemployment;
    assert.equal(u.value, null);
    assert.equal(u.year_ago, null);
    assert.equal(u.stale, true);
  });

  it("ignores editions newer than the one being fetched", async () => {
    const file = await runFetch({ edition: "2026-10", dataDir: DATA, env: {}, http: failing, write: false });
    assert.equal(file.metrics.unemployment.value, null);
  });

  it("rejects a malformed edition id", async () => {
    await assert.rejects(runFetch({ edition: "2026-13", dataDir: DATA, write: false }), /YYYY-MM/);
  });
});
