import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFedRange,
  computeFredMetric,
  computeLevel,
  computeYoy,
  computeYtd,
  fredClient,
  parseFredObservations,
} from "../../scripts/fetch/fred";
import type { MetricConfig } from "../../lib/types";
import type { Obs } from "../../scripts/fetch/types";
import { fixture, fixtureFetch, noSleep } from "./helpers";

const monthly = (start: string, values: (number | null)[]): Obs[] => {
  let [y, m] = start.split("-").map(Number);
  return values.map((value) => {
    const date = `${y}-${String(m).padStart(2, "0")}-01`;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    return { date, value };
  });
};

describe("parseFredObservations", () => {
  it('turns "." into null and never fills it', () => {
    const obs = parseFredObservations({
      observations: [
        { date: "2025-09-01", value: "4.4" },
        { date: "2025-10-01", value: "." },
        { date: "2025-11-01", value: "4.5" },
      ],
    });
    assert.deepEqual(obs, [
      { date: "2025-09-01", value: 4.4 },
      { date: "2025-10-01", value: null },
      { date: "2025-11-01", value: 4.5 },
    ]);
  });

  it("parses a FRED-shaped fixture file", () => {
    const obs = parseFredObservations(JSON.parse(fixture("fred/UNRATE.json")));
    assert.equal(obs.find((o) => o.date === "2025-10-01")?.value, null);
    assert.equal(obs.at(-1)?.value, 4.1);
  });

  it("surfaces FRED error messages", () => {
    assert.throws(() => parseFredObservations({ error_code: 400, error_message: "Bad Request." }), /Bad Request/);
  });
});

describe("computeLevel", () => {
  it("scales to the metrics.yaml unit (JOLTS thousands -> millions)", () => {
    const c = computeLevel(monthly("2025-09", [7227, ...Array(11).fill(7400), 7512]), "monthly", 1e-3);
    assert.equal(c.value, 7.512);
    assert.equal(c.year_ago, 7.227);
    assert.equal(c.period, "2026-09");
    assert.equal(c.year_ago_period, "2025-09");
  });

  it("year_ago is null when the source has no year-ago value", () => {
    const c = computeLevel(monthly("2026-01", [1, 2, 3]), "monthly");
    assert.equal(c.year_ago, null);
    assert.equal(c.year_ago_period, null);
  });
});

describe("computeYoy (CPI 12-month % change)", () => {
  it("computes the change from index levels, rounded to one decimal", () => {
    // 100 -> 103 over 12 months = 3.0%; 103 -> 106.81 = 3.7%.
    const idx = monthly("2024-09", [100, ...Array(11).fill(101), 103, ...Array(11).fill(104), 106.811]);
    const c = computeYoy(idx);
    assert.equal(c.value, 3.7);
    assert.equal(c.period, "2026-09");
    assert.equal(c.year_ago, 3.0);
    assert.equal(c.year_ago_period, "2025-09");
  });

  it("cannot compute a month whose year-earlier index is missing, so the latest is the prior month", () => {
    // Index exists for Oct 2026 but Oct 2025 was not published: no Oct 2026 y/y.
    const values: (number | null)[] = Array(26).fill(0).map((_, i) => 300 + i);
    values[13] = null; // 2025-10
    const c = computeYoy(monthly("2024-09", values));
    assert.equal(c.period, "2026-09");
  });
});

describe("computeFedRange", () => {
  it("returns the midpoint and a range display, with the year-ago range", () => {
    const lower = [
      { date: "2025-11-20", value: 3.75 },
      { date: "2026-11-19", value: 3.75 },
      { date: "2026-11-20", value: 4.0 },
    ];
    const upper = [
      { date: "2025-11-20", value: 4.0 },
      { date: "2026-11-19", value: 4.0 },
      { date: "2026-11-20", value: 4.25 },
    ];
    const c = computeFedRange(lower, upper);
    assert.equal(c.value, 4.125);
    assert.equal(c.display, "4.00–4.25%");
    assert.equal(c.period, "2026-11-20");
    assert.equal(c.period_label, "Nov 20");
    assert.equal(c.year_ago, 3.875);
    assert.equal(c.year_ago_display, "3.75–4.00%");
    assert.equal(c.year_ago_period, "2025-11-20");
  });

  it("ignores days where either bound is missing", () => {
    const c = computeFedRange(
      [
        { date: "2026-11-19", value: 3.75 },
        { date: "2026-11-20", value: 3.75 },
      ],
      [
        { date: "2026-11-19", value: 4.0 },
        { date: "2026-11-20", value: null },
      ],
    );
    assert.equal(c.period, "2026-11-19");
  });
});

describe("computeYtd (Texas permits)", () => {
  it("sums January through the latest month vs the same months a year earlier", () => {
    const obs = monthly("2025-01", [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 1, 2, 3]);
    const c = computeYtd(obs);
    assert.equal(c.value, 6);
    assert.equal(c.year_ago, 60);
    assert.equal(c.period, "2026-01/2026-03");
    assert.equal(c.year_ago_period, "2025-01/2025-03");
    assert.equal(c.period_label, "Jan–Mar");
    assert.equal(c.as_of, "2026-03");
  });

  it("refuses a partial sum when a current-year month is missing", () => {
    const obs = monthly("2026-01", [1, null, 3]);
    assert.throws(() => computeYtd(obs), /missing month/);
  });

  it("year_ago is null when a prior-year month is missing", () => {
    const obs = monthly("2025-01", [10, null, 30, ...Array(9).fill(5), 1, 2, 3]);
    assert.equal(computeYtd(obs).year_ago, null);
  });
});

describe("fredClient", () => {
  it("requests the documented endpoint and caches each series", async () => {
    const log: string[] = [];
    const raw: string[] = [];
    const get = fredClient({
      apiKey: "test-key",
      edition: "2026-11",
      http: { fetchImpl: fixtureFetch(log), sleep: noSleep },
      saveRaw: (rel) => raw.push(rel),
    });
    await get("UNRATE");
    await get("UNRATE");
    assert.equal(log.length, 1);
    const u = new URL(log[0]);
    assert.equal(u.origin + u.pathname, "https://api.stlouisfed.org/fred/series/observations");
    assert.equal(u.searchParams.get("series_id"), "UNRATE");
    assert.equal(u.searchParams.get("file_type"), "json");
    assert.equal(u.searchParams.get("api_key"), "test-key");
    assert.equal(u.searchParams.get("observation_end"), "2026-11-30");
    assert.deepEqual(raw, ["fred/UNRATE.json"]);
  });

  it("fails clearly without an API key", async () => {
    const get = fredClient({ apiKey: undefined, edition: "2026-11" });
    await assert.rejects(get("UNRATE"), /FRED_API_KEY is not set/);
  });

  it("reports FRED's error message for a bad series", async () => {
    const get = fredClient({ apiKey: "k", edition: "2026-11", http: { fetchImpl: fixtureFetch(), sleep: noSleep } });
    await assert.rejects(get("NOPE"), /FRED NOPE: Bad Request/);
  });
});

describe("computeFredMetric", () => {
  const get = fredClient({ apiKey: "k", edition: "2026-11", http: { fetchImpl: fixtureFetch(), sleep: noSleep } });
  const cfg = (over: Partial<MetricConfig>): MetricConfig => ({
    label: "x",
    unit: "pct",
    polarity: "lower_is_good",
    automation: "AUTO",
    frequency: "monthly",
    source_name: "x",
    source_url: "x",
    ...over,
  });

  it("uses the upper-bound series URL for fed funds", async () => {
    const r = await computeFredMetric("fed_funds", cfg({ frequency: "daily", fred: ["DFEDTARL", "DFEDTARU"] }), get);
    assert.equal(r.source_url, "https://fred.stlouisfed.org/series/DFEDTARU");
    assert.equal(r.display, "3.75–4.00%");
  });

  it("converts continuing claims to millions", async () => {
    const r = await computeFredMetric("continuing_claims", cfg({ unit: "millions", frequency: "weekly", fred: "CCSA" }), get);
    assert.equal(r.value, 1.763);
    assert.equal(r.year_ago, 1.949);
  });
});
