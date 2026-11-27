// Quality gates for an edition (spec Section 14.3). Exit 1 on any FAIL.
//
//   npm run validate -- 2026-11
//   npm run validate -- 2026-12 --report out/validation-2026-12.md          Markdown for the PR comment
//   npm run validate -- 2026-12 --draft-summary data/drafts/2026-12-summary.md
//   npm run validate -- 2026-12 --check-links                               HEAD every source URL (network)

import fs from "node:fs";
import path from "node:path";
import { EDITION_ID, editionFile, listEditionsAt, loadEditionAt, loadMetricsConfigAt, loadSourcesAt, previousEditionId } from "./lib/io";
import { checkLinks, editionUrls, renderReport, validateEdition, type Finding } from "./lib/validate";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a) => EDITION_ID.test(a));
const root = process.cwd();

async function main() {
  if (!id) {
    console.error("Usage: npm run validate -- YYYY-MM [--report path.md] [--draft-summary path.md] [--check-links]");
    process.exit(2);
  }
  if (!listEditionsAt(root).includes(id)) {
    console.error(`No such edition: ${path.relative(root, editionFile(root, id))}`);
    process.exit(2);
  }
  const draftPath = opt("--draft-summary");
  if (draftPath && !fs.existsSync(draftPath)) {
    console.error(`Draft summary not found: ${draftPath}`);
    process.exit(2);
  }

  const edition = loadEditionAt(root, id);
  const cfg = loadMetricsConfigAt(root);
  const prevId = previousEditionId(root, id);
  const findings: Finding[] = validateEdition({
    edition,
    cfg,
    sources: loadSourcesAt(root),
    previous: prevId ? loadEditionAt(root, prevId) : null,
    draftSummary: draftPath ? fs.readFileSync(draftPath, "utf8") : null,
  });

  const checks = [
    "Source URL and as-of date on every displayed number (FAIL)",
    "Arrows only where the comparison is y/y with a year-ago value or reported y/y change; frozen direction/color match the computed ones (FAIL)",
    draftPath ? `Draft summary numbers present in the edition JSON, ±0.05 (FAIL): ${draftPath}` : "Draft summary numbers: skipped (no --draft-summary)",
    `Banned forecast/advice words in edition text${draftPath ? " and the draft" : ""}, excluding URLs and quoted titles (FAIL)`,
    `Freshness vs. max_age_days, measured at data_as_of ${edition.data_as_of} (WARN)`,
    prevId ? `Moves over 3× the typical monthly move vs. ${prevId} (WARN)` : "Moves vs. previous edition: skipped (no previous edition)",
    "Same metric, same value in display, key-indicator table, reference levels, asset cards and tile sub-lines (WARN)",
    "Bullet link phrases occur in their text (WARN)",
    "Source URLs listed in data/config/sources.yaml (WARN)",
  ];
  if (args.includes("--check-links")) {
    const urls = editionUrls(edition, cfg);
    console.log(`Checking ${urls.length} links...`);
    findings.push(...(await checkLinks(urls)));
    checks.push(`Links answer 2xx/3xx (WARN): ${urls.length} checked`);
  } else checks.push("Broken links: skipped (add --check-links)");

  const report = renderReport(id, findings, checks);
  const reportPath = opt("--report");
  if (reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(reportPath, report);
    console.log(`Report written to ${reportPath}`);
  }
  console.log(report);
  process.exit(findings.some((f) => f.level === "FAIL") ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
