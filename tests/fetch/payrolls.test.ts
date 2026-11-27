import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fetchBlsSeries, parseBlsSeries } from "../../scripts/fetch/bls";
import { fredClient, parseFredObservations } from "../../scripts/fetch/fred";
import type { FetchImpl } from "../../scripts/fetch/http";
import { computePayrollsChange, fetchPayrolls, formatSignedCount } from "../../scripts/fetch/payrolls";
import { runFetch } from "../../scripts/fetch/run";
import type { Obs } from "../../scripts/fetch/types";
import { fixture, noSleep, ROOT } from "./helpers";

// All series below are SYNTHETIC test data (tests/fixtures/fred/PAYEMS.json, tests/fixtures/bls/CES0000000001.json).
const payems = () => parseFredObservations(JSON.parse(fixture("fred/PAYEMS.json")));
const blsJson = () => JSON.parse(fixture("bls/CES0000000001.json"));

const respond = (status: number, body: string) => ({ ok: status === 200, status, statusText: status === 200 ? "OK" : "Error", text: async () => body });

/** Fake network: FRED and BLS each serve a fixture body, or fail. Records BLS request bodies. */
function fakeFetch(o: { fred?: string | null; bls?: string | null; blsBodies?: string[] }): FetchImpl {
  return async (url, init) => {
    const u = new URL(url);
    if (u.hostname === "api.stlouisfed.org") {
      if (o.fred == null) throw new Error("FRED unreachable");
      return respond(200, o.fred);
    }
    if (u.hostname === "api.bls.gov") {
      const req = init as unknown as { method?: string; body?: string };
      assert.equal(req.method, "POST");
      o.blsBodies?.push(req.body ?? "");
      if (o.bls == null) throw new Error("BLS unreachable");
      return respond(200, o.bls);
    }
    return respond(404, "not found");
  };
}

const withValue = (obs: Obs[], date: string, value: number | null) => obs.map((x) => (x.date === date ? { ...x, value } : x));

describe("computePayrollsChange (synthetic PAYEMS fixture)", () => {
  it("reproduces the edition: Oct 2026 +165,000, prior 12-month average 48,000, no y/y", () => {
    assert.deepEqual(computePayrollsChange(payems()), {
      value: 165000,
      period: "2026-10",
      period_label: "Oct",
      year_ago: null,
      year_ago_period: null,
      as_of: "2026-10",
      display: "+165,000",
      notes: "Prior 12-month average 48,000.",
    });
  });

  it("re-pulls revisions: a revised September level changes the October change and the average", () => {
    // BLS revised September up by 12 (thousand): Oct change falls by 12,000, the Sep change in the 12-month window rises.
    const sep = payems().find((o) => o.date === "2026-09-01")!.value!;
    const c = computePayrollsChange(withValue(payems(), "2026-09-01", sep + 12));
    assert.equal(c.value, 153000);
    assert.equal(c.display, "+153,000");
    assert.equal(c.notes, "Prior 12-month average 49,000.");
  });

  it("rounds the average to the nearest thousand, as BLS states payroll changes", () => {
    // Window sum 576 + 7 = 583 -> 48.58 -> 49,000.
    const sep = payems().find((o) => o.date === "2026-09-01")!.value!;
    const obs = withValue(withValue(payems(), "2026-09-01", sep + 7), "2026-10-01", sep + 7 + 165);
    assert.equal(computePayrollsChange(obs).notes, "Prior 12-month average 49,000.");
  });

  it("formats losses with a minus sign", () => {
    const sep = payems().find((o) => o.date === "2026-09-01")!.value!;
    const c = computePayrollsChange(withValue(payems(), "2026-10-01", sep - 20));
    assert.equal(c.value, -20000);
    assert.equal(c.display, "−20,000");
    assert.equal(formatSignedCount(0), "0");
    assert.equal(formatSignedCount(-48000).replace(/^\+/, ""), "−48,000");
  });

  it("missing latest month: reports the latest month that has a value (never filled)", () => {
    const c = computePayrollsChange(withValue(payems(), "2026-10-01", null));
    assert.equal(c.period, "2026-09");
    assert.equal(c.value, 46000);
  });

  it("missing prior month: refuses to compute a change across the gap", () => {
    assert.throws(() => computePayrollsChange(withValue(payems(), "2026-09-01", null)), /no level for 2026-09/);
  });

  it("missing month inside the 12-month window does not change the average (changes telescope)", () => {
    assert.equal(computePayrollsChange(withValue(payems(), "2026-03-01", null)).notes, "Prior 12-month average 48,000.");
  });

  it("missing start of the 12-month window: notes omitted, not estimated", () => {
    const c = computePayrollsChange(withValue(payems(), "2025-09-01", null));
    assert.equal(c.value, 165000);
    assert.equal(c.notes, undefined);
  });

  it("throws on an empty series", () => {
    assert.throws(() => computePayrollsChange([{ date: "2026-10-01", value: null }]), /no observations/);
  });
});

describe("parseBlsSeries (documented BLS v2 format, synthetic values)", () => {
  it("parses monthly observations oldest first and matches the FRED fixture", () => {
    const obs = parseBlsSeries(blsJson(), "CES0000000001");
    assert.equal(obs[0].date, "2024-01-01");
    assert.equal(obs.at(-1)!.date, "2026-10-01");
    const fred = new Map(payems().map((o) => [o.date, o.value]));
    for (const o of obs) assert.equal(o.value, fred.get(o.date), o.date);
    assert.deepEqual(computePayrollsChange(obs).notes, "Prior 12-month average 48,000.");
  });

  it('skips annual averages (M13), strips thousands separators, "-" becomes null', () => {
    const obs = parseBlsSeries(
      {
        status: "REQUEST_SUCCEEDED",
        message: [],
        Results: {
          series: [
            {
              seriesID: "CES0000000001",
              data: [
                { year: "2026", period: "M02", value: "-" },
                { year: "2026", period: "M01", value: "159,123" },
                { year: "2025", period: "M13", value: "158000" },
                { year: "2025", period: "M12", value: "159100" },
              ],
            },
          ],
        },
      },
      "CES0000000001",
    );
    assert.deepEqual(obs, [
      { date: "2025-12-01", value: 159100 },
      { date: "2026-01-01", value: 159123 },
      { date: "2026-02-01", value: null },
    ]);
  });

  it("surfaces BLS error status and messages", () => {
    assert.throws(
      () => parseBlsSeries({ status: "REQUEST_NOT_PROCESSED", message: ["Daily threshold for total number of requests allocated has been reached."], Results: {} }, "CES0000000001"),
      /REQUEST_NOT_PROCESSED \(Daily threshold/,
    );
    assert.throws(
      () => parseBlsSeries({ status: "REQUEST_SUCCEEDED", message: ["No Data Available for Series CES0000000001 Year: 2026"], Results: { series: [{ seriesID: "CES0000000001", data: [] }] } }, "CES0000000001"),
      /no data \(No Data Available/,
    );
    assert.throws(() => parseBlsSeries({ status: "REQUEST_SUCCEEDED", Results: { series: [] } }, "CES0000000001"), /no data/);
  });
});

describe("fetchBlsSeries", () => {
  it("POSTs the documented JSON payload, with registrationkey only when set, and redacts the key from errors", async () => {
    const bodies: string[] = [];
    await fetchBlsSeries({ seriesId: "CES0000000001", startYear: 2024, endYear: 2026, http: { fetchImpl: fakeFetch({ bls: fixture("bls/CES0000000001.json"), blsBodies: bodies }), sleep: noSleep }, apiBase: "https://api.bls.gov/publicAPI/v2/timeseries/data/" });
    assert.deepEqual(JSON.parse(bodies[0]), { seriesid: ["CES0000000001"], startyear: "2024", endyear: "2026" });

    const bad = JSON.stringify({ status: "REQUEST_NOT_PROCESSED", message: ["Invalid key SECRETKEY"] });
    await assert.rejects(
      fetchBlsSeries({ seriesId: "CES0000000001", startYear: 2024, endYear: 2026, apiKey: "SECRETKEY", http: { fetchImpl: fakeFetch({ bls: bad, blsBodies: bodies }), sleep: noSleep }, apiBase: "https://api.bls.gov/publicAPI/v2/timeseries/data/" }),
      (e: Error) => !e.message.includes("SECRETKEY") && /REDACTED/.test(e.message),
    );
    assert.equal(JSON.parse(bodies[1]).registrationkey, "SECRETKEY");
  });
});

describe("fetchPayrolls: FRED first, BLS fallback", () => {
  const run = (net: Parameters<typeof fakeFetch>[0], env: Record<string, string> = {}) => {
    const http = { fetchImpl: fakeFetch(net), sleep: noSleep };
    const fred = fredClient({ apiKey: "test-key", edition: "2026-11", http, apiBase: "https://api.stlouisfed.org/fred/series/observations" });
    return fetchPayrolls({ fred, edition: "2026-11", env, http });
  };

  it("uses FRED when it works and never calls BLS", async () => {
    const bodies: string[] = [];
    const r = await run({ fred: fixture("fred/PAYEMS.json"), bls: null, blsBodies: bodies });
    assert.equal(r.value, 165000);
    assert.equal(r.source_url, "https://fred.stlouisfed.org/series/PAYEMS");
    assert.equal(r.notes, "Prior 12-month average 48,000.");
    assert.equal(bodies.length, 0);
  });

  it("falls back to BLS when FRED fails, with the BLS source URL and the edition's years", async () => {
    const bodies: string[] = [];
    const r = await run({ fred: null, bls: fixture("bls/CES0000000001.json"), blsBodies: bodies }, { BLS_API_KEY: "k" });
    assert.deepEqual(
      { value: r.value, display: r.display, period: r.period, notes: r.notes, stale: r.stale, url: r.source_url },
      { value: 165000, display: "+165,000", period: "2026-10", notes: "Prior 12-month average 48,000.", stale: false, url: "https://data.bls.gov/timeseries/CES0000000001" },
    );
    assert.deepEqual(JSON.parse(bodies[0]), { seriesid: ["CES0000000001"], startyear: "2024", endyear: "2026", registrationkey: "k" });
  });

  it("falls back to BLS when FRED data cannot produce a change (missing prior month)", async () => {
    const fred = JSON.parse(fixture("fred/PAYEMS.json"));
    fred.observations = fred.observations.map((o: { date: string; value: string }) => (o.date === "2026-09-01" ? { ...o, value: "." } : o));
    const r = await run({ fred: JSON.stringify(fred), bls: fixture("bls/CES0000000001.json") });
    assert.equal(r.value, 165000);
    assert.match(r.source_url, /data\.bls\.gov/);
  });

  it("throws with both errors when FRED and BLS fail", async () => {
    await assert.rejects(run({ fred: null, bls: null }), /FRED unreachable.*BLS fallback: .*BLS unreachable/);
  });
});

describe("runFetch: payrolls_change stale fallback when FRED and BLS both fail (spec 12.4)", () => {
  it("keeps the November edition's value and display, marked stale with both errors", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-payrolls-"));
    const file = await runFetch({
      edition: "2026-12",
      dataDir: path.join(ROOT, "data"),
      outDir: out,
      env: { FRED_API_KEY: "test-key" },
      http: { fetchImpl: fakeFetch({ fred: null, bls: null }), sleep: noSleep },
      write: false,
    });
    const p = file.metrics.payrolls_change;
    assert.equal(p.stale, true);
    assert.equal(p.value, 165000);
    assert.equal(p.display, "+165,000");
    assert.equal(p.period, "2026-10");
    assert.equal(p.year_ago, null);
    assert.match(p.error!, /FRED unreachable.*BLS fallback/);
    assert.doesNotMatch(p.error!, /No automated fetcher/);
  });
});
