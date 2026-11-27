// Runs all automated fetchers for an edition (spec 11.1, 12.1 step 2).
//
//   npm run fetch -- 2026-12
//
// Writes data/raw/2026-12/auto.json plus the raw API responses (fred/, eurostat/, apartmentlist/)
// for the audit trail. Needs FRED_API_KEY (free: https://fred.stlouisfed.org/docs/api/api_key.html);
// optional APARTMENTLIST_CSV_URL (current rent-estimates CSV link). A failed fetch keeps the latest
// edition's value marked stale and never fails the run (spec 12.4).

import path from "node:path";
import { runFetch } from "./run";

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const edition = arg ?? new Date().toISOString().slice(0, 7);
  const result = await runFetch({ edition });
  const all = { ...result.metrics, ...result.extras };
  const stale = Object.entries(all).filter(([, r]) => r.stale);
  const fresh = Object.keys(all).length - stale.length;
  console.log(`Edition ${edition}: ${fresh} fresh, ${stale.length} stale`);
  for (const [id, r] of stale) console.log(`  stale  ${id}: ${r.error}`);
  console.log(`Wrote ${path.join("data", "raw", edition, "auto.json")}`);
}

main().catch((e) => {
  // Only bad arguments or an unreadable config get here; fetch failures are recorded as stale.
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
