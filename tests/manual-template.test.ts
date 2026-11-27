import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { load as yamlLoad } from "js-yaml";
import { buildEdition } from "../scripts/lib/build";
import type { ManualFile } from "../scripts/lib/io";
import { makeManualTemplate } from "../scripts/lib/manual-template";
import { tempFixture } from "./helpers";

test("manual template: MANUAL/SEMI + stale AUTO metrics, pre-filled and stale", () => {
  const root = tempFixture();
  fs.rmSync(path.join(root, "data/manual/2030-02.yaml"));
  const res = makeManualTemplate(root, "2030-02");
  assert.equal(res.written, true);
  // auto_f came back stale in auto.json; rate_a and price_b were fetched fresh and are left out.
  assert.deepEqual(res.ids.sort(), ["auto_f", "change_g", "count_d", "index_c", "level_e"]);

  const text = fs.readFileSync(res.file, "utf8");
  assert.match(text, /HOW TO FILL THIS IN \(GitHub web editor/);
  const y = yamlLoad(text) as ManualFile;
  const c = y.metrics.index_c;
  assert.equal(c.stale, true);
  assert.equal(c.required, true);
  assert.equal(c.value, 45);
  assert.equal(c.period, "2030-01");
  assert.equal(c.source_url, "https://example.com/index-c");
  assert.equal(c.carry_forward, false);
  assert.equal(c.carry_forward_reason, "");
  assert.ok(c.expected_release && c.expected_release.length > 0);
  assert.equal(y.metrics.auto_f.expected_release?.includes("fetched automatically"), true);
  assert.deepEqual(y.metrics.change_g.change_reported, { pct: -2 });
  assert.equal(y.metrics.change_g.display, "$1,500/mo", "real display overrides are carried");
  assert.equal(y.metrics.index_c.display, undefined, "standard-format displays are not");

  // An untouched template fails the build on required metrics (spec 11.2)...
  const fail = buildEdition({ root, id: "2030-02" });
  assert.equal(fail.ok, false);
  assert.ok(fail.errors.some((e) => e.includes("index_c")));
  assert.ok(fail.errors.some((e) => e.includes("level_e")));
});

test("manual template: never overwrites an existing file", () => {
  const root = tempFixture();
  const file = path.join(root, "data/manual/2030-02.yaml");
  const before = fs.readFileSync(file, "utf8");
  const res = makeManualTemplate(root, "2030-02");
  assert.equal(res.written, false);
  assert.match(res.message, /already exists/);
  assert.equal(fs.readFileSync(file, "utf8"), before);

  // Also after the owner edits a freshly generated one
  fs.rmSync(file);
  makeManualTemplate(root, "2030-02");
  fs.appendFileSync(file, "# owner edit\n");
  const edited = fs.readFileSync(file, "utf8");
  assert.equal(makeManualTemplate(root, "2030-02").written, false);
  assert.equal(fs.readFileSync(file, "utf8"), edited);
});

test("manual template: without auto.json every AUTO metric is listed", () => {
  const root = tempFixture();
  fs.rmSync(path.join(root, "data/manual/2030-02.yaml"));
  fs.rmSync(path.join(root, "data/raw"), { recursive: true });
  const res = makeManualTemplate(root, "2030-02");
  assert.ok(["rate_a", "price_b", "auto_f"].every((id) => res.ids.includes(id)));
});
