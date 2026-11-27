// Optional independent AI audit (spec 14.4). Needs ANTHROPIC_API_KEY.
//
//   npm run audit -- 2026-12                                   reviews the edition (and data/drafts/2026-12-summary.md if present)
//   npm run audit -- 2026-12 --draft data/drafts/2026-12-summary.md
//   npm run audit -- 2026-12 --out out/audit-2026-12.md        (default)
//
// A separate call from the drafter, acting as a skeptical economist. It writes a list of findings
// (location, issue, suggested neutral rewrite) and changes nothing; a human decides.
// Exits 0 when the report was written, 1 when the call failed, 2 on bad arguments.

import fs from "node:fs";
import path from "node:path";
import { anthropicClient, describeApiError, modelFromEnv } from "./lib/ai";
import { auditEdition } from "./lib/audit";
import { EDITION_ID, dataPath, editionFile, listEditionsAt, loadEditionAt, loadMetricsConfigAt } from "./lib/io";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a) => EDITION_ID.test(a));
const root = process.cwd();

async function main() {
  if (!id) {
    console.error("Usage: npm run audit -- YYYY-MM [--draft path.md] [--out path.md]");
    process.exit(2);
  }
  if (!listEditionsAt(root).includes(id)) {
    console.error(`No such edition: ${path.relative(root, editionFile(root, id))}`);
    process.exit(2);
  }
  const explicitDraft = opt("--draft");
  if (explicitDraft && !fs.existsSync(explicitDraft)) {
    console.error(`Draft not found: ${explicitDraft}`);
    process.exit(2);
  }
  const defaultDraft = dataPath(root, "drafts", `${id}-summary.md`);
  const draftFile = explicitDraft ?? (fs.existsSync(defaultDraft) ? defaultDraft : null);
  const out = opt("--out") ?? path.join("out", `audit-${id}.md`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set; the AI audit is optional and was skipped.");
    process.exit(1);
  }

  const model = modelFromEnv();
  const draftRel = draftFile ? path.relative(root, path.resolve(draftFile)) : null;
  console.log(`Auditing edition ${id}${draftRel ? ` and ${draftRel}` : ""} with ${model}...`);
  const res = await auditEdition({
    client: anthropicClient(),
    model,
    id,
    edition: loadEditionAt(root, id),
    cfg: loadMetricsConfigAt(root),
    draft: draftFile ? fs.readFileSync(draftFile, "utf8") : null,
    draftPath: draftRel,
  });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, res.markdown);
  console.log(`${res.audit.findings.length} finding(s). Wrote ${out}.`);
}

main().catch((err) => {
  console.error(`AI audit failed: ${describeApiError(err)}`);
  process.exit(1);
});
