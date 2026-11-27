// Admin form: validation rules, form -> YAML changes, and the comment-preserving YAML editor,
// checked against the real template format (scripts/lib/manual-template.ts) and the build.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { load as yamlLoad } from "js-yaml";
import {
  type FieldForm,
  type FieldMeta,
  entryPatch,
  formFromEntry,
  initialForm,
  isPeriod,
  parseNumber,
  suggestLabel,
  validateField,
  yearEarlier,
} from "../lib/admin/fields";
import { ManualFileError, applyPatches, headerComment, parseManual } from "../lib/admin/manual-yaml";
import { buildFieldGroups, metricAreas } from "../lib/admin/model";
import { buildEdition } from "../scripts/lib/build";
import type { ManualFile } from "../scripts/lib/io";
import { makeManualTemplate } from "../scripts/lib/manual-template";
import { tempFixture } from "./helpers";

const REPO = path.join(__dirname, "..");

/** A December template generated from the repository's real data, in a temp copy. */
function realTemplate(): { text: string; metricsYaml: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-admin-"));
  fs.cpSync(path.join(REPO, "data", "config"), path.join(root, "data", "config"), { recursive: true });
  fs.cpSync(path.join(REPO, "data", "editions"), path.join(root, "data", "editions"), { recursive: true });
  const id = "2099-01"; // after every real edition, so it is pre-filled from the newest one
  const res = makeManualTemplate(root, id);
  return { text: fs.readFileSync(res.file, "utf8"), metricsYaml: fs.readFileSync(path.join(root, "data/config/metrics.yaml"), "utf8") };
}

const has = { has_display: false, has_year_ago_display: false, has_change_reported: false };
const blank: FieldForm = {
  status: "stale", value: "", display: "", period: "", period_label: "", as_of: "", year_ago: "",
  year_ago_display: "", year_ago_period: "", change_pct: "", change_points: "", source_url: "", reason: "",
};

test("numbers: plain numbers only", () => {
  assert.deepEqual(parseNumber("4.1"), { ok: true, value: 4.1 });
  assert.deepEqual(parseNumber(" -0.3 "), { ok: true, value: -0.3 });
  assert.deepEqual(parseNumber("+165000"), { ok: true, value: 165000 });
  assert.deepEqual(parseNumber("416,700"), { ok: true, value: 416700 });
  assert.deepEqual(parseNumber(""), { ok: true, value: null });
  for (const bad of ["4.1%", "$416,700", "41,67", "1.2.3", "abc", "1e5", "NaN", "Infinity", "4 1"]) {
    assert.equal(parseNumber(bad).ok, false, bad);
  }
});

test("periods: the formats used in the YAML", () => {
  for (const ok of ["2026", "2026-11", "2026-11-20", "2026-Q3", "2026-H1", "2026-01/2026-10", "2025-01/2025-09"]) assert.ok(isPeriod(ok), ok);
  for (const bad of ["Nov 2026", "2026-13", "2026-Q5", "2026-11-32", "26-11", "2026/11", "2026-01/2026-02/2026-03", "", "latest week"]) {
    assert.equal(isPeriod(bad), false, bad);
  }
  // Every period and as-of in a real template passes.
  const m = parseManual(realTemplate().text);
  for (const [id, e] of Object.entries(m.metrics)) {
    for (const k of ["period", "as_of", "year_ago_period"] as const) {
      if (e[k]) assert.ok(isPeriod(String(e[k])), `${id}.${k} = ${e[k]}`);
    }
  }
});

test("validation: updated entries need value, period, label and as-of", () => {
  const e = validateField(has, { ...blank, status: "updated" });
  assert.ok(e.value && e.period && e.period_label && e.as_of);
  const ok = validateField(has, { ...blank, status: "updated", value: "4.2", period: "2026-11", period_label: "Nov", as_of: "2026-11" });
  assert.deepEqual(ok, {});
  const ya = validateField(has, { ...blank, status: "updated", value: "4.2", period: "2026-11", period_label: "Nov", as_of: "2026-11", year_ago: "4.0" });
  assert.ok(ya.year_ago_period, "a year-ago value needs its period");
});

test("validation: formats, carry-forward reason, text limits", () => {
  assert.ok(validateField(has, { ...blank, value: "4.1%" }).value);
  assert.ok(validateField(has, { ...blank, as_of: "Nov 20, 2026" }).as_of);
  assert.ok(validateField(has, { ...blank, period: "2026-11-31x" }).period);
  assert.ok(validateField(has, { ...blank, status: "carry" }).reason);
  assert.ok(validateField(has, { ...blank, status: "carry", reason: "   " }).reason);
  assert.deepEqual(validateField(has, { ...blank, status: "carry", reason: "Quarterly; next Dec 4" }), {});
  assert.ok(validateField(has, { ...blank, reason: "a\nb" }).reason, "no line breaks");
  assert.ok(validateField(has, { ...blank, source_url: "javascript:alert(1)" }).source_url);
  assert.ok(validateField(has, { ...blank, display: "x" }).display, "no display line, no display text");
  assert.ok(validateField(has, { ...blank, status: "nope" as never }).status);
  assert.deepEqual(validateField(has, blank), {}, "an untouched stale entry is fine");
});

test("form helpers: label and year-ago suggestions", () => {
  assert.equal(suggestLabel("2026-11"), "Nov");
  assert.equal(suggestLabel("2026-Q3"), "Q3");
  assert.equal(suggestLabel("2026-11-20"), "Nov 20");
  assert.equal(suggestLabel("2026-01/2026-10"), "Jan–Oct");
  assert.equal(suggestLabel("2026"), "2026");
  assert.equal(yearEarlier("2026-11"), "2025-11");
  assert.equal(yearEarlier("2026-01/2026-10"), "2025-01/2025-10");
  assert.equal(yearEarlier("nope"), "");
});

test("round trip: untouched form changes nothing; every untouched entry is valid", () => {
  const { text, metricsYaml } = realTemplate();
  const m = parseManual(text);
  const groups = buildFieldGroups(m, metricsYaml);
  const metas = groups.flatMap((g) => g.fields);
  assert.equal(metas.length, Object.keys(m.metrics).length);
  const patches: Record<string, ReturnType<typeof entryPatch>> = {};
  for (const meta of metas) {
    const f = initialForm(meta);
    assert.deepEqual(validateField(meta, f), {}, meta.id);
    patches[meta.id] = entryPatch(m.metrics[meta.id], meta, f);
    assert.deepEqual(patches[meta.id], {}, `${meta.id} untouched -> no change`);
  }
  const res = applyPatches(text, patches);
  assert.equal(res.text, text, "byte-identical");
  assert.equal(res.inPlace, true);
});

test("grouping: areas follow the divider comments in metrics.yaml", () => {
  const { text, metricsYaml } = realTemplate();
  const { order } = metricAreas(metricsYaml);
  assert.deepEqual(order.slice(0, 3), ["Labor", "Prices and rates", "Housing (U.S.)"]);
  const groups = buildFieldGroups(parseManual(text), metricsYaml);
  assert.equal(groups[0].area, "Labor");
  assert.ok(groups.every((g) => g.fields.length > 0));
  assert.ok(groups.some((g) => g.area === "Texas"));
});

test("editing: only the edited lines change; comments and other entries are kept", () => {
  const { text } = realTemplate();
  const m = parseManual(text);
  const id = "unemployment";
  const meta = { has_display: false, has_year_ago_display: false, has_change_reported: false };
  const form: FieldForm = {
    ...formFromEntry(m.metrics[id]),
    status: "updated", value: "4.2", period: "2026-11", period_label: "Nov", as_of: "2026-11", year_ago: "4.2", year_ago_period: "2025-11",
  };
  const p = entryPatch(m.metrics[id], meta, form);
  assert.deepEqual(p, { stale: false, value: 4.2, period: "2026-11", period_label: "Nov", year_ago: 4.2, year_ago_period: "2025-11", as_of: "2026-11" });
  const res = applyPatches(text, { [id]: p });
  assert.equal(res.inPlace, true);
  assert.ok(res.text.startsWith(headerComment(text).trimEnd()), "header comment kept");
  assert.match(res.text, /# Unemployment rate · AUTO .* REQUIRED/);
  assert.match(res.text, /stale: false {12}# set to false once this month's number is entered/, "inline comment kept");
  const a = text.split("\n");
  const b = res.text.split("\n");
  assert.equal(a.length, b.length);
  const changed = a.map((l, i) => (l !== b[i] ? i : -1)).filter((i) => i >= 0);
  assert.equal(changed.length, 7, "stale, value, period, period_label, year_ago, year_ago_period, as_of");
  const y = yamlLoad(res.text) as ManualFile;
  assert.equal(y.metrics[id].value, 4.2);
  assert.equal(y.metrics[id].stale, false);
  assert.deepEqual(y.metrics.initial_claims, m.metrics.initial_claims);
});

test("editing: carry forward, display removal, reported change, inserted keys", () => {
  const { text } = realTemplate();
  const m = parseManual(text);
  // payrolls_change has a display override line.
  const pm = { has_display: true, has_year_ago_display: false, has_change_reported: false };
  const p1 = entryPatch(m.metrics.payrolls_change, pm, {
    ...formFromEntry(m.metrics.payrolls_change), status: "updated", value: "120000", display: "", period: "2026-11", period_label: "Nov", as_of: "2026-11", year_ago: "",
  });
  assert.equal("display" in p1 && p1.display === undefined, true, "blank display on update removes the line");
  // An entry with change_reported.
  const cid = Object.keys(m.metrics).find((k) => m.metrics[k].change_reported?.pct != null)!;
  const cm = { has_display: m.metrics[cid].display !== undefined, has_year_ago_display: m.metrics[cid].year_ago_display !== undefined, has_change_reported: true };
  const cf = formFromEntry(m.metrics[cid]);
  const p2 = entryPatch(m.metrics[cid], cm, { ...cf, display: cm.has_display ? "" : cf.display, status: "updated", change_pct: "-5.5", change_points: "", period: "2026-11", period_label: "Nov", as_of: "2026-11", value: "100" });
  assert.deepEqual(p2.change_reported, { pct: -5.5 });
  // Carry forward on a stale entry: blanks keep the old numbers.
  const p3 = entryPatch(m.metrics.job_openings, has, { ...initialForm({ current: formFromEntry(m.metrics.job_openings) } as FieldMeta), status: "carry", reason: "JOLTS delayed; out Dec 9" });
  assert.deepEqual(p3, { carry_forward: true, carry_forward_reason: "JOLTS delayed; out Dec 9" });

  const res = applyPatches(text, { payrolls_change: p1, [cid]: p2, job_openings: p3 });
  assert.equal(res.inPlace, true);
  const y = yamlLoad(res.text) as ManualFile;
  assert.equal(y.metrics.payrolls_change.display, undefined);
  assert.equal(y.metrics.payrolls_change.year_ago, null);
  assert.deepEqual(y.metrics[cid].change_reported, { pct: -5.5 });
  assert.equal(y.metrics.job_openings.carry_forward, true);
  assert.equal(y.metrics.job_openings.value, m.metrics.job_openings.value);
  assert.match(res.text, /change_reported: \{ pct: -5\.5 \} {3}# y\/y change as the source reports it/);

  // A key the entry lacks is inserted in template order.
  const lean = 'edition: "2030-02"\nmetrics:\n  a:\n    stale: true\n    value: 1\n    as_of: "2030-01"\n';
  const r2 = applyPatches(lean, { a: { stale: false, period: "2030-02", period_label: "Feb" } });
  assert.equal(r2.inPlace, true);
  assert.equal(r2.text, 'edition: "2030-02"\nmetrics:\n  a:\n    stale: false\n    value: 1\n    period: "2030-02"\n    period_label: "Feb"\n    as_of: "2030-01"\n');
});

test("editing: strings are quoted safely", () => {
  const src = 'metrics:\n  a:\n    stale: true\n    carry_forward: false\n    carry_forward_reason: ""\n';
  const reason = 'He said "no" # not a comment: {x} \\ –';
  const r = applyPatches(src, { a: { carry_forward: true, carry_forward_reason: reason } });
  assert.equal((yamlLoad(r.text) as ManualFile).metrics.a.carry_forward_reason, reason);
  assert.equal(r.inPlace, true);
});

test("editing: unusual layouts fall back to re-serializing and keep the header comment", () => {
  const src = "# Header line one\n# Header two\n\nedition: \"2030-02\"\nmetrics:\n  a:\n    stale: true\n    notes: |\n      multi\n      line\n    carry_forward_reason: >\n      folded\n      text\n";
  const r = applyPatches(src, { a: { carry_forward_reason: "new", carry_forward: true } });
  assert.equal(r.inPlace, false);
  assert.ok(r.text.startsWith("# Header line one\n# Header two\n\n"));
  const y = yamlLoad(r.text) as ManualFile;
  assert.equal(y.metrics.a.carry_forward_reason, "new");
  assert.equal(y.metrics.a.notes, "multi\nline\n");
  assert.throws(() => applyPatches("metrics: [1, 2]\n", {}), ManualFileError);
  assert.throws(() => applyPatches("metrics:\n  a: [\n", {}), ManualFileError);
});

test("build: an admin-form edit is accepted by build-edition exactly like a hand edit", () => {
  const root = tempFixture();
  const file = path.join(root, "data/manual/2030-02.yaml");
  fs.rmSync(file);
  makeManualTemplate(root, "2030-02");
  const text = fs.readFileSync(file, "utf8");
  const m = parseManual(text);
  // Required index_c gets a new value; required level_e is carried forward with a reason.
  const meta = { has_display: false, has_year_ago_display: false, has_change_reported: false };
  const pi = entryPatch(m.metrics.index_c, meta, { ...blank, status: "updated", value: "47.5", period: "2030-02", period_label: "Feb", as_of: "2030-02", year_ago: "50", year_ago_period: "2029-02", source_url: "" });
  const pl = entryPatch(m.metrics.level_e, meta, { ...blank, status: "carry", reason: "Quarterly; next release in March" });
  const res = applyPatches(text, { index_c: pi, level_e: pl });
  assert.equal(res.inPlace, true);
  fs.writeFileSync(file, res.text);
  const built = buildEdition({ root, id: "2030-02" });
  assert.equal(built.ok, true, built.errors.join("\n"));
  assert.equal(built.sources.index_c, "manual");
  assert.equal(built.edition!.metrics.index_c.value, 47.5);
  assert.equal(built.sources.level_e, "carried_forward");
});
