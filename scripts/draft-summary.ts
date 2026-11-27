// Optional AI summary drafter (spec 12.1 step 5, Appendix E). Needs ANTHROPIC_API_KEY.
//
//   npm run draft-summary -- 2026-12                writes data/drafts/2026-12-summary.md
//   npm run draft-summary -- 2026-12 --out tmp.md   writes somewhere else (never data/editions/)
//
// Model: ANTHROPIC_MODEL (default in scripts/lib/ai.ts). One API call, two if the first draft
// fails the validator's draft-summary checks. The draft is for review only: the owner copies
// text into data/editions/YYYY-MM.json by hand. Exits 0 when a draft was written (even one marked
// VALIDATION FAILED), 1 when no draft could be produced, 2 on bad arguments.

import fs from "node:fs";
import path from "node:path";
import { anthropicClient, describeApiError, modelFromEnv } from "./lib/ai";
import { draftSummary } from "./lib/draft-summary";
import { EDITION_ID, dataPath, editionFile, listEditionsAt, loadEditionAt, loadMetricsConfigAt, loadSourcesAt } from "./lib/io";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a) => EDITION_ID.test(a));
const root = process.cwd();

async function main() {
  if (!id) {
    console.error("Usage: npm run draft-summary -- YYYY-MM [--out path.md]");
    process.exit(2);
  }
  if (!listEditionsAt(root).includes(id)) {
    console.error(`No such edition: ${path.relative(root, editionFile(root, id))}`);
    process.exit(2);
  }
  const out = path.resolve(opt("--out") ?? dataPath(root, "drafts", `${id}-summary.md`));
  const editionsDir = path.resolve(dataPath(root, "editions")) + path.sep;
  if (out.startsWith(editionsDir)) {
    console.error("Refusing to write into data/editions/: drafts are copied in by hand after review.");
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set; the AI drafter is optional and was skipped.");
    process.exit(1);
  }

  const model = modelFromEnv();
  console.log(`Drafting the ${id} summary with ${model}...`);
  const res = await draftSummary({
    client: anthropicClient(),
    model,
    id,
    edition: loadEditionAt(root, id),
    cfg: loadMetricsConfigAt(root),
    sources: loadSourcesAt(root),
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, res.markdown);
  const rel = path.relative(root, out);
  if (res.failures.length) {
    console.warn(`::warning::AI draft for ${id} still fails ${res.failures.length} check(s) after a retry; written with a VALIDATION FAILED header to ${rel}.`);
    for (const f of res.failures) console.warn(`  - ${f}`);
  } else {
    console.log(`Draft passed the checks (${res.attempts === 1 ? "first attempt" : "after one retry"}). Wrote ${rel}.`);
  }
}

main().catch((err) => {
  console.error(`AI draft failed: ${describeApiError(err)}`);
  process.exit(1);
});
