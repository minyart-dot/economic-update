import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findYearAgo, labelOf, latestObs, periodOf, sameDateYearEarlier } from "../../scripts/fetch/periods";
import type { Obs } from "../../scripts/fetch/types";

describe("period ids and labels", () => {
  it("formats each frequency", () => {
    assert.equal(periodOf("2026-10-01", "monthly"), "2026-10");
    assert.equal(labelOf("2026-10-01", "monthly"), "Oct");
    assert.equal(periodOf("2026-04-01", "quarterly"), "2026-Q2");
    assert.equal(labelOf("2026-04-01", "quarterly"), "Q2");
    assert.equal(periodOf("2026-11-19", "weekly"), "2026-11-19");
    assert.equal(labelOf("2026-11-19", "daily"), "Nov 19");
    assert.equal(labelOf("2026-11-05", "daily"), "Nov 5");
  });

  it("maps Feb 29 to Feb 28 a year earlier", () => {
    assert.equal(sameDateYearEarlier("2028-02-29"), "2027-02-28");
  });
});

describe("latestObs", () => {
  it("skips trailing missing observations", () => {
    const obs: Obs[] = [
      { date: "2026-11-19", value: 4.9 },
      { date: "2026-11-20", value: null },
    ];
    assert.deepEqual(latestObs(obs), { date: "2026-11-19", value: 4.9 });
    assert.equal(latestObs([{ date: "2026-11-20", value: null }]), null);
  });
});

describe("findYearAgo", () => {
  it("monthly: same month a year earlier", () => {
    const obs: Obs[] = [
      { date: "2025-09-01", value: 4.4 },
      { date: "2025-10-01", value: 4.3 },
      { date: "2026-10-01", value: 4.1 },
    ];
    assert.deepEqual(findYearAgo(obs, "2026-10-01", "monthly"), { date: "2025-10-01", value: 4.3 });
  });

  it("monthly: when the year-ago month is missing, uses the nearest earlier published month", () => {
    const obs: Obs[] = [
      { date: "2025-09-01", value: 4.4 },
      { date: "2025-10-01", value: null },
      { date: "2026-10-01", value: 4.1 },
    ];
    assert.deepEqual(findYearAgo(obs, "2026-10-01", "monthly"), { date: "2025-09-01", value: 4.4 });
  });

  it("monthly: gives up after two months back (no value rather than a distant one)", () => {
    const obs: Obs[] = [
      { date: "2025-07-01", value: 4.2 },
      { date: "2025-08-01", value: null },
      { date: "2025-09-01", value: null },
      { date: "2025-10-01", value: null },
      { date: "2026-10-01", value: 4.1 },
    ];
    assert.equal(findYearAgo(obs, "2026-10-01", "monthly"), null);
  });

  it("quarterly: same quarter a year earlier", () => {
    const obs: Obs[] = [
      { date: "2025-01-01", value: 4.3 },
      { date: "2025-04-01", value: 4.19 },
      { date: "2026-04-01", value: 3.82 },
    ];
    assert.deepEqual(findYearAgo(obs, "2026-04-01", "quarterly"), { date: "2025-04-01", value: 4.19 });
  });

  it("weekly: same week a year earlier (364 days, same weekday)", () => {
    const obs: Obs[] = [
      { date: "2025-11-13", value: 6.24 },
      { date: "2025-11-20", value: 6.26 },
      { date: "2025-11-27", value: 6.23 },
      { date: "2026-11-19", value: 7.28 },
    ];
    assert.deepEqual(findYearAgo(obs, "2026-11-19", "weekly"), { date: "2025-11-20", value: 6.26 });
  });

  it("weekly: nearest observation on or before the target when the week is missing", () => {
    const obs: Obs[] = [
      { date: "2025-11-13", value: 6.24 },
      { date: "2025-11-20", value: null },
      { date: "2026-11-19", value: 7.28 },
    ];
    assert.deepEqual(findYearAgo(obs, "2026-11-19", "weekly"), { date: "2025-11-13", value: 6.24 });
  });

  it("daily: nearest observation on or before the same date (weekend -> Friday)", () => {
    const obs: Obs[] = [
      { date: "2025-11-20", value: 4.1 },
      { date: "2025-11-21", value: 4.06 },
      { date: "2025-11-24", value: 4.03 },
      { date: "2026-11-22", value: 4.9 },
    ];
    // 2025-11-22 was a Saturday.
    assert.deepEqual(findYearAgo(obs, "2026-11-22", "daily"), { date: "2025-11-21", value: 4.06 });
  });

  it("daily: never uses an observation after the target or more than a week before", () => {
    const obs: Obs[] = [
      { date: "2025-11-01", value: 4.0 },
      { date: "2025-11-24", value: 4.03 },
      { date: "2026-11-20", value: 4.9 },
    ];
    assert.equal(findYearAgo(obs, "2026-11-20", "daily"), null);
  });
});
