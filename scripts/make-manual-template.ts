// Writes data/manual/YYYY-MM.yaml for the owner to fill in (spec Section 11.2).
//
//   npm run manual-template -- 2026-12
//
// One entry per MANUAL/SEMI metric in data/config/metrics.yaml, plus AUTO metrics that came back stale in
// data/raw/YYYY-MM/auto.json, pre-filled from the previous edition with stale: true.
// Never overwrites an existing file.

import { EDITION_ID } from "./lib/io";
import { makeManualTemplate } from "./lib/manual-template";

const id = process.argv.slice(2).find((a) => EDITION_ID.test(a));
if (!id) {
  console.error("Usage: npm run manual-template -- YYYY-MM");
  process.exit(2);
}

const res = makeManualTemplate(process.cwd(), id);
console.log(res.message);
if (res.written) console.log(`Entries: ${res.ids.join(", ")}`);
