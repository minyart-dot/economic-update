// Kastle office occupancy and NY Fed household-debt delinquency (SEMI, best effort).
// All inputs are SYNTHETIC: tests/fixtures/kastle/barometer.html and an xlsx generated below.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { buildEdition } from "../../scripts/lib/build";
import { makeManualTemplate } from "../../scripts/lib/manual-template";
import type { FetchImpl } from "../../scripts/fetch/http";
import { computeKastle, kastleRefDate, parseKastle, parseWeekDate } from "../../scripts/fetch/kastle";
import { defaultNyfedUrl, expectedQuarter, parseHhdc, parseQuarterLabel, readWorkbook, type Sheet } from "../../scripts/fetch/nyfed";
import { runFetch } from "../../scripts/fetch/run";
import { fixture, noSleep, ROOT } from "./helpers";

const KASTLE_HTML = fixture("kastle/barometer.html");

// ---------------------------------------------------------------- Kastle

describe("Kastle parser (synthetic page)", () => {
  it("reads the 10-city average and week ending; skips scripts, styles, peaks and city rows", () => {
    assert.deepEqual(parseKastle(KASTLE_HTML, "2026-11-25"), { value: 56.2, week_ending: "2026-11-18" });
  });
  it("formats like the edition: ~56%, no year-ago", () => {
    const c = computeKastle({ value: 56.2, week_ending: "2026-11-18" });
    assert.equal(c.display, "~56%");
    assert.equal(c.period, "2026-11-18");
    assert.equal(c.period_label, "week ending Nov 18");
    assert.equal(c.year_ago, null);
    assert.equal(c.year_ago_period, null);
  });
  it("accepts other date spellings", () => {
    assert.equal(parseWeekDate("November 18, 2026"), "2026-11-18");
    assert.equal(parseWeekDate("Sept 3 2026"), "2026-09-03");
    assert.equal(parseWeekDate("11/18/2026"), "2026-11-18");
    assert.equal(parseWeekDate("2026-11-18"), "2026-11-18");
    assert.equal(parseWeekDate("Foo 18, 2026"), null);
    assert.equal(parseWeekDate("Feb 30, 2026"), null);
  });
  it("reference date is the earlier of today and the end of the edition month", () => {
    assert.equal(kastleRefDate("2026-11", new Date("2026-11-27T10:00:00Z")), "2026-11-27");
    assert.equal(kastleRefDate("2026-10", new Date("2026-11-27T10:00:00Z")), "2026-10-31");
  });

  const fails = (html: string, re: RegExp, ref = "2026-11-25") => assert.throws(() => parseKastle(html, ref), re);
  it("fails safely on a changed page (no recognizable figure)", () => {
    fails("<p>Occupancy this week: 56% of pre-pandemic levels (week ending Nov 18, 2026)</p>", /no '10-city average/);
    fails("<p>10-City Average 56.2%</p>", /no 'week ending/);
    fails("<p>10-City Average 56.2% · week ending Nov 31, 2026</p>", /cannot read week-ending date/);
  });
  it("fails safely on an ambiguous page", () => {
    fails("<p>Week ending Nov 18, 2026. 10-City Average 56.2%. Last week the 10-city average was 54.9%.</p>", /ambiguous 10-city average/);
    fails("<p>10-City Average 56.2% for the week ending Nov 18, 2026 vs the week ending Nov 11, 2026.</p>", /ambiguous week-ending/);
  });
  it("sanity checks: 20–100% and a week ending within 21 days before the reference date", () => {
    fails("<p>Week ending Nov 18, 2026: 10-City Average 12%</p>", /outside the plausible range/);
    fails("<p>Week ending Nov 18, 2026: 10-City Average 156%</p>", /outside the plausible range/);
    fails(KASTLE_HTML, /more than 21 days/, "2026-12-15");
    fails(KASTLE_HTML, /after the edition reference date/, "2026-11-10");
  });
});

// ---------------------------------------------------------------- NY Fed

const QUARTERS = ["24:Q3", "24:Q4", "25:Q1", "25:Q2", "25:Q3", "25:Q4", "26:Q1", "26:Q2", "26:Q3"];
/** Made-up delinquent shares; 25:Q3 = 4.48 and 26:Q3 = 4.96 match the November 2026 edition. */
const DELINQUENT = [3.57, 3.6, 4.27, 4.36, 4.48, 4.52, 4.81, 4.85, 4.96];

/** Synthetic HHDC-like workbook: a 90+ by loan type sheet (must be ignored) and the delinquency status table. */
async function makeWorkbook(opts: { quarters?: string[]; delinquent?: number[]; extraSheet?: (wb: ExcelJS.Workbook) => void } = {}) {
  const quarters = opts.quarters ?? QUARTERS;
  const delinquent = opts.delinquent ?? DELINQUENT;
  const wb = new ExcelJS.Workbook();
  const toc = wb.addWorksheet("Contents");
  toc.addRow(["SYNTHETIC TEST WORKBOOK - not NY Fed data"]);

  const p12 = wb.addWorksheet("Page 12 Data");
  p12.addRow(["Percent of Balance 90+ Days Delinquent by Loan Type"]);
  p12.addRow([]);
  p12.addRow([null, "MORTGAGE", "HE REVOLVING", "AUTO LOAN", "CREDIT CARD", "STUDENT LOAN", "OTHER", "ALL"]);
  quarters.forEach((q, i) => p12.addRow([q, 0.9, 0.5, 5, 12, 9 + i * 0.1, 7, 3.1 + i * 0.01]));

  const p11 = wb.addWorksheet("Page 11 Data");
  p11.addRow(["Total Debt Balance by Delinquency Status"]);
  p11.addRow(["Percent of balance"]);
  p11.addRow([]);
  p11.addRow([null, "Current", "30 days late", "60 days late", "90 days late", "120+ days late", "Severely Derogatory"]);
  quarters.forEach((q, i) => {
    const d = delinquent[i];
    // split the delinquent share across the five buckets; Current makes the row add up to 100
    const parts = [d * 0.3, d * 0.1, d * 0.05, d * 0.35, d * 0.2].map((x) => Math.round(x * 1e6) / 1e6);
    const rest = Math.round((d - parts.reduce((a, b) => a + b, 0)) * 1e6) / 1e6;
    parts[0] += rest;
    p11.addRow([q, { formula: "100-SUM(C1:G1)", result: Math.round((100 - d) * 1e6) / 1e6 }, ...parts]);
  });
  p11.addRow([]);
  p11.addRow(["Source: synthetic"]);
  opts.extraSheet?.(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const sheetsOf = async (o?: Parameters<typeof makeWorkbook>[0]) => readWorkbook(await makeWorkbook(o));

describe("NY Fed workbook parser (synthetic xlsx)", () => {
  it("finds the delinquency status table by header text: 4.96 (Q3 2026) vs 4.48 (Q3 2025)", async () => {
    const c = parseHhdc(await sheetsOf(), "2026-Q3");
    assert.deepEqual(c, {
      value: 4.96,
      period: "2026-Q3",
      period_label: "Q3",
      year_ago: 4.48,
      year_ago_period: "2025-Q3",
      as_of: "2026-Q3",
    });
  });
  it("accepts an explicit 'some stage of delinquency' column anywhere in the sheet", () => {
    const sheets: Sheet[] = [
      {
        name: "Summary",
        rows: [
          ["Notes"],
          [],
          [null, null, "Quarter", "Total balance", "Percent of balance in some stage of delinquency"],
          [null, null, "2025 Q3", 18.3, 4.48],
          [null, null, "2026 Q2", 18.6, 4.85],
          [null, null, "2026 Q3", 18.8, 4.96],
        ],
      },
    ];
    assert.equal(parseHhdc(sheets, "2026-Q3").value, 4.96);
    assert.equal(parseHhdc(sheets, "2026-Q3").year_ago, 4.48);
  });
  it("reads fraction units (rows adding up to 1.0)", () => {
    const sheets: Sheet[] = [
      {
        name: "Page 11 Data",
        rows: [
          [null, "Current", "30 days late", "60 days late", "90 days late", "120+ days late", "Severely Derogatory"],
          ["25:Q3", 0.9552, 0.01, 0.005, 0.005, 0.015, 0.0098],
          ["26:Q3", 0.9504, 0.012, 0.005, 0.0056, 0.016, 0.011],
        ],
      },
    ];
    const c = parseHhdc(sheets, "2026-Q3");
    assert.equal(c.value, 4.96);
    assert.equal(c.year_ago, 4.48);
  });
  it("quarter labels and expected quarter", () => {
    assert.equal(parseQuarterLabel("26:Q3"), "2026-Q3");
    assert.equal(parseQuarterLabel("03:Q1"), "2003-Q1");
    assert.equal(parseQuarterLabel("2026Q3"), "2026-Q3");
    assert.equal(parseQuarterLabel("Q3 2026"), "2026-Q3");
    assert.equal(parseQuarterLabel("Q5 2026"), null);
    assert.equal(expectedQuarter("2026-11"), "2026-Q3");
    assert.equal(expectedQuarter("2026-10"), "2026-Q3");
    assert.equal(expectedQuarter("2026-09"), "2026-Q2");
    assert.equal(expectedQuarter("2027-01"), "2026-Q4");
    assert.equal(
      defaultNyfedUrl("2026-11"),
      "https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/xls/HHD_C_Report_2026Q3.xlsx",
    );
  });
  it("fails when the latest quarter is not the expected one", async () => {
    assert.throws(() => parseHhdc([] as Sheet[], "2026-Q3"), /no 'delinquency status'/);
    const sheets = await sheetsOf();
    assert.throws(() => parseHhdc(sheets, "2026-Q4"), /latest quarter is 2026-Q3, expected 2026-Q4/);
  });
  it("fails on implausible values (0–20%)", async () => {
    const sheets = await sheetsOf({ delinquent: DELINQUENT.map((d, i) => (i === DELINQUENT.length - 1 ? 24.96 : d)) });
    assert.throws(() => parseHhdc(sheets, "2026-Q3"), /outside the plausible range/);
  });
  it("fails when the layout changed (only the 90+ by loan type table is left)", async () => {
    const sheets = (await sheetsOf()).filter((s) => s.name !== "Page 11 Data");
    assert.throws(() => parseHhdc(sheets, "2026-Q3"), /no 'delinquency status'/);
  });
  it("skips a status table that is not in percent (rows do not add to 100)", () => {
    const sheets: Sheet[] = [
      {
        name: "Balances",
        rows: [
          [null, "Current", "30 days late", "60 days late", "90 days late", "120+ days late", "Severely Derogatory"],
          ["26:Q3", 17.9, 0.22, 0.09, 0.1, 0.3, 0.2],
        ],
      },
    ];
    assert.throws(() => parseHhdc(sheets, "2026-Q3"), /no 'delinquency status'/);
  });
  it("fails when two matching tables disagree", async () => {
    const sheets = await sheetsOf({
      extraSheet: (wb) => {
        const s = wb.addWorksheet("Other");
        s.addRow([null, "Total delinquent"]);
        s.addRow(["26:Q3", 5.4]);
      },
    });
    assert.throws(() => parseHhdc(sheets, "2026-Q3"), /tables disagree/);
  });
});

// ---------------------------------------------------------------- run.ts -> auto.json -> manual template / build

const respond = (status: number, body: string | Buffer) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? "OK" : "Not Found",
  text: async () => body.toString(),
  arrayBuffer: async () => {
    const b = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  },
});

function fakeFetch(kastle: string | null, xlsx: Buffer | null, log: string[] = []): FetchImpl {
  return async (url) => {
    log.push(url);
    const host = new URL(url).hostname;
    if (host === "www.kastle.com" && kastle !== null) return respond(200, kastle);
    if (host === "www.newyorkfed.org" && xlsx !== null) return respond(200, xlsx);
    return respond(404, "not found");
  };
}

/** A temp data root with the real config and the November 2026 edition as the previous edition. */
function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-semi-"));
  for (const rel of ["data/config", "data/editions"]) fs.mkdirSync(path.join(root, rel), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "data/config"))) {
    fs.copyFileSync(path.join(ROOT, "data/config", f), path.join(root, "data/config", f));
  }
  fs.copyFileSync(path.join(ROOT, "data/editions/2026-11.json"), path.join(root, "data/editions/2026-11.json"));
  return root;
}

const DEC_KASTLE = KASTLE_HTML.replace("Nov. 18, 2026", "Dec. 16, 2026").replace(">56.2%<", ">54.6%<");

describe("runFetch + manual template + build: fresh values win, failures go to the manual template", () => {
  it("a successful fetch gives fresh records that the template skips and the build uses", async () => {
    const root = tempRoot();
    const log: string[] = [];
    const file = await runFetch({
      edition: "2026-12",
      dataDir: path.join(root, "data"),
      env: {},
      http: { fetchImpl: fakeFetch(DEC_KASTLE, await makeWorkbook(), log), sleep: noSleep },
      now: new Date("2026-12-20T12:00:00Z"),
    });
    const k = file.metrics.office_occupancy_kastle;
    assert.equal(k.stale, false, k.error ?? "");
    assert.equal(k.value, 54.6);
    assert.equal(k.display, "~55%");
    assert.equal(k.period, "2026-12-16");
    assert.equal(k.source_url, "https://www.kastle.com/safety-wellness/getting-america-back-to-work/");
    const n = file.metrics.hh_debt_delinquent;
    assert.equal(n.stale, false, n.error ?? "");
    assert.deepEqual([n.value, n.period, n.year_ago, n.year_ago_period], [4.96, "2026-Q3", 4.48, "2025-Q3"]);
    assert.equal(n.source_url, "https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/hhdc_2026q3.pdf");
    assert.ok(log.includes("https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/xls/HHD_C_Report_2026Q3.xlsx"));
    assert.ok(fs.existsSync(path.join(root, "data/raw/2026-12/kastle/barometer.html")));
    assert.ok(fs.existsSync(path.join(root, "data/raw/2026-12/nyfed/HHD_C_Report_2026Q3.xlsx.base64")));

    const t = makeManualTemplate(root, "2026-12");
    assert.equal(t.written, true);
    assert.ok(!t.ids.includes("office_occupancy_kastle"), "fresh SEMI value is not asked for by hand");
    assert.ok(!t.ids.includes("hh_debt_delinquent"));
    assert.ok(t.ids.includes("existing_home_sales"), "MANUAL metrics still listed");

    const b = buildEdition({ root, id: "2026-12", draft: true, now: new Date("2026-12-20T12:00:00Z") });
    assert.equal(b.sources.office_occupancy_kastle, "auto");
    assert.equal(b.sources.hh_debt_delinquent, "auto");
    const m = b.edition!.metrics;
    assert.equal(m.office_occupancy_kastle.value, 54.6);
    assert.equal(m.office_occupancy_kastle.display, "~55%");
    assert.equal(m.hh_debt_delinquent.value, 4.96);
    assert.equal(m.hh_debt_delinquent.year_ago, 4.48);
  });

  it("env overrides KASTLE_URL and NYFED_HHDC_URL are used", async () => {
    const log: string[] = [];
    await runFetch({
      edition: "2026-12",
      dataDir: path.join(ROOT, "data"),
      env: { KASTLE_URL: "https://www.kastle.com/other-page/", NYFED_HHDC_URL: "https://www.newyorkfed.org/x/HHD_C_Report_2026Q3_v2.xlsx" },
      http: { fetchImpl: fakeFetch(DEC_KASTLE, await makeWorkbook(), log), sleep: noSleep },
      now: new Date("2026-12-20T12:00:00Z"),
      write: false,
    });
    assert.ok(log.includes("https://www.kastle.com/other-page/"));
    assert.ok(log.includes("https://www.newyorkfed.org/x/HHD_C_Report_2026Q3_v2.xlsx"));
  });

  it("a failed or doubtful fetch keeps last edition's value stale and the metric stays in the manual template", async () => {
    const root = tempRoot();
    const ambiguous = DEC_KASTLE.replace("</section>", "<p>10-City Average 58.0%</p></section>");
    const file = await runFetch({
      edition: "2026-12",
      dataDir: path.join(root, "data"),
      env: {},
      http: { fetchImpl: fakeFetch(ambiguous, null), sleep: noSleep },
      now: new Date("2026-12-20T12:00:00Z"),
    });
    const k = file.metrics.office_occupancy_kastle;
    assert.equal(k.stale, true);
    assert.match(k.error!, /ambiguous 10-city average/);
    assert.equal(k.value, 56, "previous edition value carried, never a scraped guess");
    assert.equal(k.display, "~56%");
    const n = file.metrics.hh_debt_delinquent;
    assert.equal(n.stale, true);
    assert.match(n.error!, /HTTP 404/);
    assert.deepEqual([n.value, n.period, n.year_ago], [4.96, "2026-Q3", 4.48]);

    const t = makeManualTemplate(root, "2026-12");
    assert.ok(t.ids.includes("office_occupancy_kastle"));
    assert.ok(t.ids.includes("hh_debt_delinquent"));
    const text = fs.readFileSync(t.file, "utf8");
    assert.match(text, /best-effort fetch failed: Kastle page: ambiguous/);

    const b = buildEdition({ root, id: "2026-12", draft: true, now: new Date("2026-12-20T12:00:00Z") });
    assert.equal(b.sources.office_occupancy_kastle, "stale");
    assert.equal(b.sources.hh_debt_delinquent, "stale");
  });
});
