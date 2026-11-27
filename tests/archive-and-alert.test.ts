// Spec 17 acceptance: the VIX banner level (test 15, 22, 33, 45) and the inversion flag;
// archived editions use their frozen history snapshot, not the live history files.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAlert, vixLevel } from "../lib/alert";
import { historyFor, loadLiveHistory } from "../lib/data";
import { getEdition } from "../lib/edition";
import { buildChartData } from "../lib/chartData";

test("VIX banner level changes at 20 / 30 / 40", () => {
  assert.equal(vixLevel(15), "normal");
  assert.equal(vixLevel(22), "elevated");
  assert.equal(vixLevel(33), "high");
  assert.equal(vixLevel(45), "extreme");
  assert.equal(vixLevel(19.99), "normal");
  assert.equal(vixLevel(20), "elevated");
  assert.equal(vixLevel(30), "high");
  assert.equal(vixLevel(40), "extreme");
  assert.match(buildAlert(15, "Nov 18", 0.3).text, /^● VIX NORMAL · 15\.00 \(Nov 18\), below 20\./);
  assert.match(buildAlert(22, "Nov 18", 0.3).text, /VIX ELEVATED/);
  assert.match(buildAlert(33, "Nov 18", 0.3).text, /VIX HIGH ALERT/);
  assert.match(buildAlert(45, "Nov 18", 0.3).text, /VIX EXTREME/);
});

test("yield-curve inversion flag shows only below zero", () => {
  assert.equal(buildAlert(22, "Nov 18", 0.3).inverted, false);
  assert.equal(buildAlert(22, "Nov 18", 0).inverted, false);
  const inv = buildAlert(22, "Nov 18", -0.05);
  assert.equal(inv.inverted, true);
  assert.equal(inv.inversion_text, "Yield curve inverted (10-yr below 2-yr)");
});

test("published 2026-11 uses its frozen history snapshot", () => {
  const { snapshot, history } = historyFor("2026-11");
  assert.equal(snapshot, true);
  assert.deepEqual(history, loadLiveHistory(), "snapshot was taken from the current history");
  assert.equal(getEdition("2026-11").history_snapshot, true);
});

test("appending to live history does not change an archived edition's charts", () => {
  const file = path.join(process.cwd(), "data", "history", "us_annual.json");
  const original = fs.readFileSync(file, "utf8");
  const before = JSON.stringify(buildChartData(getEdition("2026-11")).C1.data);
  try {
    const us = JSON.parse(original);
    us.years_2006_2025 = [...us.years_2006_2025, 2026];
    us.unemployment_rate_annual_avg_pct = [...us.unemployment_rate_annual_avg_pct, 99];
    us.mortgage30_annual_avg_pct = [...us.mortgage30_annual_avg_pct, 99];
    fs.writeFileSync(file, JSON.stringify(us));
    const after = JSON.stringify(buildChartData(getEdition("2026-11")).C1.data);
    assert.equal(after, before);
    assert.notDeepEqual(loadLiveHistory().us.years_2006_2025.length, 20);
  } finally {
    fs.writeFileSync(file, original);
  }
});
