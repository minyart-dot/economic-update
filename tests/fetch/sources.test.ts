import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeRent, parseRentCsv } from "../../scripts/fetch/apartmentlist";
import { computeEurostatMetric, parseJsonStatSeries, pickGeo, type JsonStat } from "../../scripts/fetch/eurostat";
import { fixture } from "./helpers";

const ds = () => JSON.parse(fixture("eurostat/une_rt_m.json")) as JsonStat;

describe("Eurostat JSON-stat (une_rt_m)", () => {
  it("extracts one series, missing cells as null", () => {
    const obs = parseJsonStatSeries(ds(), { age: "Y_LT25", geo: "EU27_2020" });
    assert.deepEqual(obs, [
      { date: "2025-08-01", value: null },
      { date: "2025-09-01", value: 14.8 },
      { date: "2026-08-01", value: 15.3 },
      { date: "2026-09-01", value: 15.5 },
    ]);
  });

  it("prefers the newest euro-area composition present", () => {
    assert.equal(pickGeo(ds(), ["EA21", "EA20"]), "EA21");
    assert.equal(pickGeo(ds(), ["EA22", "EA20"]), "EA20");
  });

  it("computes euro-area and EU youth unemployment with year-ago", () => {
    const ea = computeEurostatMetric(ds(), "euro_unemployment");
    assert.deepEqual(
      { v: ea.value, p: ea.period, ya: ea.year_ago, yap: ea.year_ago_period },
      { v: 6.5, p: "2026-09", ya: 6.3, yap: "2025-09" },
    );
    const youth = computeEurostatMetric(ds(), "eu_youth_unemployment");
    assert.equal(youth.value, 15.5);
    assert.equal(youth.year_ago, 14.8);
    assert.equal(youth.period_label, "Sep");
  });

  it("accepts the older 2026M09 time format and array values", () => {
    const d = ds();
    d.dimension.time.category.index = { "2025M09": 0, "2026M09": 1 };
    d.id = ["geo", "time"];
    d.size = [1, 2];
    d.dimension = { geo: { category: { index: { EA20: 0 } } }, time: d.dimension.time };
    d.value = [6.3, 6.5];
    assert.deepEqual(parseJsonStatSeries(d, { geo: "EA20" }), [
      { date: "2025-09-01", value: 6.3 },
      { date: "2026-09-01", value: 6.5 },
    ]);
  });
});

describe("Apartment List rent CSV", () => {
  const series = parseRentCsv(fixture("apartmentlist/rent_estimates.csv"));

  it("finds the national row and the four Texas metros (not same-named cities)", () => {
    assert.deepEqual(Object.keys(series).sort(), ["rent_austin", "rent_dallas_fw", "rent_houston", "rent_san_antonio", "us_median_rent"]);
    assert.equal(series.rent_dallas_fw.at(-1)?.value, 1413);
  });

  it("computes latest rent and the same month a year earlier", () => {
    const us = computeRent(series.us_median_rent);
    assert.deepEqual(
      { v: us.value, p: us.period, ya: us.year_ago, yap: us.year_ago_period },
      { v: 1384, p: "2026-10", ya: 1383, yap: "2025-10" },
    );
    const sa = computeRent(series.rent_san_antonio);
    assert.equal(Math.round((sa.value! / sa.year_ago! - 1) * 1000) / 10, -3.8);
  });

  it("uses only overall rows when the file has a bed_size column", () => {
    const csv = "location_name,location_type,location_fips_code,bed_size,2025_10,2026_10\nUnited States,National,,1br,1200,1210\nUnited States,National,,overall,1383,1384\n";
    assert.equal(computeRent(parseRentCsv(csv).us_median_rent).value, 1384);
  });

  it("rejects a file without month columns", () => {
    assert.throws(() => parseRentCsv("a,b\n1,2\n"), /no YYYY_MM columns/);
  });
});
