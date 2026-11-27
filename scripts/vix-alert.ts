// Between-edition market volatility alert (spec Section 9, 12.3).
//
//   npm run vix-alert                         check only: fetch the latest VIX close and print the decision
//   npm run vix-alert -- --dry-run            if the rule fires, create a Buttondown DRAFT for the "alerts" tag (nothing is sent)
//   npm run vix-alert -- --dry-run --force    create that draft even when the rule does not fire (marked TEST), to check the audience
//   npm run vix-alert -- --send               if the rule fires, email subscribers tagged "alerts" and log to data/alerts.json
//   --date YYYY-MM-DD    evaluate the close on or before this date (default: today, America/Chicago)
//   --threshold N        alert level (default 30, or env VIX_ALERT_THRESHOLD)
//   --no-cboe            FRED only; skip the Cboe CSV fallback for same-day closes
//
// Rule: VIX close >= threshold AND no alert sent in the last 5 trading days (weekdays; market holidays
// are not excluded). Needs FRED_API_KEY (or the Cboe CSV), BUTTONDOWN_API_KEY for --dry-run/--send,
// and SITE_URL for --send. Sending is refused unless Buttondown confirms the tag-only audience.

import { DEFAULT_THRESHOLD, runVixAlert, todayCentral, type Mode } from "./lib/vix-alert";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const value = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const mode: Mode = flag("--send") ? "send" : flag("--dry-run") ? "dry-run" : "check";
  if (flag("--send") && flag("--dry-run")) throw new Error("Pass either --send or --dry-run, not both");
  const rawThreshold = value("--threshold") || process.env.VIX_ALERT_THRESHOLD || String(DEFAULT_THRESHOLD);
  const threshold = Number(rawThreshold);
  if (!Number.isFinite(threshold)) throw new Error(`Invalid threshold: ${rawThreshold}`);
  const res = await runVixAlert({
    mode,
    date: value("--date") || todayCentral(),
    threshold,
    force: flag("--force"),
    cboe: !flag("--no-cboe"),
  });
  if (res.failed) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
