// Builds data/editions/YYYY-MM.json (status "draft") from the previous edition + auto.json + manual YAML.
//
//   npm run build:edition -- 2026-12            fail if a required manual value is still stale
//   npm run build:edition -- 2026-12 --draft    stale required values become warnings (preview PR)
//   npm run build:edition -- 2026-12 --out tmp/2026-12.json   write somewhere else
//
// Computed fields (change, direction, color, ...) are frozen per spec 10.2 using lib/edition.ts.
// Text the pipeline cannot regenerate is copied from the previous edition and printed as NEEDS REVIEW.
// Refuses to overwrite an edition whose status is "ready" or "published".

import fs from "node:fs";
import path from "node:path";
import { buildEdition } from "./lib/build";
import { EDITION_ID, editionFile, readJson, writeJson } from "./lib/io";

const args = process.argv.slice(2);
const id = args.find((a) => EDITION_ID.test(a));
const draft = args.includes("--draft");
const outIdx = args.indexOf("--out");
const root = process.cwd();

if (!id) {
  console.error("Usage: npm run build:edition -- YYYY-MM [--draft] [--out path.json]");
  process.exit(2);
}

const target = outIdx >= 0 ? path.resolve(args[outIdx + 1] ?? "") : editionFile(root, id);
if (fs.existsSync(target)) {
  const status = readJson<{ status?: string }>(target).status;
  if (status && status !== "draft") {
    console.error(`Refusing to overwrite ${path.relative(root, target)} (status "${status}"). Use --out to write elsewhere.`);
    process.exit(1);
  }
}

const res = buildEdition({ root, id, draft });
const counts = Object.values(res.sources).reduce<Record<string, number>>((acc, s) => ((acc[s] = (acc[s] ?? 0) + 1), acc), {});

console.log(`Edition ${id}${draft ? " (draft mode)" : ""} · structure from ${res.baseEdition ?? "—"}`);
console.log(`Values: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}`);
for (const w of res.warnings) console.log(`WARN  ${w}`);
for (const e of res.errors) console.error(`ERROR ${e}`);

if (!res.ok || !res.edition) {
  console.error(`\nBuild failed: ${res.errors.length} error(s). Nothing written.`);
  process.exit(1);
}

writeJson(target, res.edition);
console.log(`\nNEEDS REVIEW (copied, not regenerated; never fabricated):`);
for (const r of res.needsReview) console.log(`  - ${r}`);
const shown = path.relative(root, target).startsWith("..") ? target : path.relative(root, target);
console.log(`\nWrote ${shown} with status "draft".${outIdx < 0 ? ` Next: npm run validate -- ${id}` : ""}`);
