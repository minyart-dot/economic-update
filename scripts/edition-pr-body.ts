// Writes the Markdown for the monthly edition pull request (spec 12.1 step 7, 15) and for the
// validation comment that is refreshed whenever the owner edits the edition branch.
//
//   npx tsx scripts/edition-pr-body.ts YYYY-MM --kind body|comment --out FILE
//       [--report out/validation-YYYY-MM.md] [--build-log out/build-YYYY-MM.log]
//       [--build-status N] [--validate-status N]
//
// The manual-field checklist is read from data/manual/YYYY-MM.yaml (written by
// `npm run manual-template`). Its exact layout belongs to that script, so this reads it
// tolerantly: any mapping that has a `value` or `stale` key is a field, and missing labels and
// source links fall back to data/config/metrics.yaml.

import fs from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a) => /^\d{4}-\d{2}$/.test(a));
if (!id) {
  console.error("Usage: tsx scripts/edition-pr-body.ts YYYY-MM --kind body|comment --out FILE [...]");
  process.exit(2);
}
const kind = opt("--kind") === "comment" ? "comment" : "body";
const outFile = opt("--out") ?? `out/pr-${kind}-${id}.md`;
const buildStatus = opt("--build-status");
const validateStatus = opt("--validate-status");

const COMMENT_MARKER = "<!-- state-of-the-market:validation -->";
const MAX = 60_000; // GitHub limits a PR body or comment to 65,536 characters.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

interface MetricCfg {
  label?: string;
  source_name?: string;
  source_url?: string;
  frequency?: string;
  required?: boolean;
}
const metricsCfg: Record<string, MetricCfg> = (() => {
  try {
    const f = yamlLoad(fs.readFileSync(path.join("data", "config", "metrics.yaml"), "utf8")) as { metrics?: Record<string, MetricCfg> };
    return f.metrics ?? {};
  } catch {
    return {};
  }
})();

// Typical release timing by source (spec 11.2), used when the template gives none.
const TIMING: [RegExp, string][] = [
  [/pending/i, "NAR, ~end of month"],
  [/NAR|realtor\.org|existing.home/i, "NAR, ~3rd week"],
  [/NAHB|HMI|builder/i, "NAHB/Wells Fargo HMI, ~mid-month"],
  [/Challenger/i, "Challenger, first week"],
  [/NY ?Fed|college labor|recent.grad/i, "NY Fed, quarterly"],
  [/ATTOM|RealtyTrac|foreclos|flip/i, "ATTOM, mid-month (flipping quarterly)"],
  [/Epiq|ABI|bankrupt/i, "Epiq/ABI, first week"],
  [/Fitch|subprime/i, "Fitch auto ABS, monthly"],
  [/MBA|delinquency survey/i, "MBA NDS, quarterly"],
  [/MHARR|MHI|manufactured/i, "MHARR, monthly"],
  [/TMHA|titled/i, "TMHA, monthly"],
  [/TRERC|rural land|land price/i, "TRERC, quarterly"],
  [/Texas Realtors|TPR/i, "Texas Realtors/TRERC, monthly"],
  [/NTREIS|MetroTex|HAR|Unlock|SABOR/i, "Metro MLS, monthly"],
  [/RealPage|apartment|occupancy/i, "RealPage, quarterly"],
  [/CBRE|Yardi|Moody|Newmark|office/i, "CBRE/Yardi, monthly or quarterly"],
  [/Cushman|industrial/i, "Cushman & Wakefield, quarterly"],
  [/Colliers|retail/i, "Colliers, quarterly"],
  [/capex|earnings/i, "Company earnings, quarterly"],
  [/DXY|ICE|dollar/i, "Market close, monthly snapshot"],
  [/FedWatch|CME/i, "CME FedWatch, snapshot"],
  [/Eurostat/i, "Eurostat, quarterly"],
];

interface Field {
  id: string;
  label: string;
  source?: string;
  timing?: string;
  stale: boolean;
  required: boolean;
  carryForward: boolean;
  asOf?: string;
}

function toField(key: string, e: Obj): Field {
  const fid = str(e.id) ?? str(e.metric) ?? key;
  const cfg = metricsCfg[fid] ?? metricsCfg[key] ?? {};
  const src = isObj(e.source) ? e.source : {};
  const source =
    str(e.source_url) ?? str(e.url) ?? str(src.url) ?? (str(e.source)?.startsWith("http") ? str(e.source) : undefined) ?? cfg.source_url;
  const sourceName = str(e.source_name) ?? str(src.name) ?? (str(e.source)?.startsWith("http") ? undefined : str(e.source)) ?? cfg.source_name ?? "";
  const timing =
    str(e.expected_release) ??
    str(e.expected_release_date) ??
    str(e.release_timing) ??
    str(e.release_date) ??
    str(e.next_release) ??
    str(e.release) ??
    TIMING.find(([re]) => re.test(`${sourceName} ${source ?? ""} ${fid}`))?.[1] ??
    cfg.frequency;
  return {
    id: fid,
    label: str(e.label) ?? cfg.label ?? fid,
    source,
    timing,
    stale: e.stale === true,
    required: e.required === true || (e.required === undefined && cfg.required === true),
    carryForward: e.carry_forward === true,
    asOf: str(e.as_of) ?? str(e.period),
  };
}

function collect(node: unknown, key: string, out: Field[]) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => collect(n, isObj(n) ? (str(n.id) ?? str(n.metric) ?? `${key}[${i}]`) : key, out));
    return;
  }
  if (!isObj(node)) return;
  if ("value" in node || "stale" in node) {
    out.push(toField(key, node));
    return;
  }
  for (const [k, v] of Object.entries(node)) collect(v, k, out);
}

function manualFields(): { fields: Field[]; error?: string } {
  const file = path.join("data", "manual", `${id}.yaml`);
  if (!fs.existsSync(file)) return { fields: [], error: `\`${file}\` does not exist (the manual-template step may have failed).` };
  try {
    const fields: Field[] = [];
    collect(yamlLoad(fs.readFileSync(file, "utf8")), "", fields);
    return { fields };
  } catch (e) {
    return { fields: [], error: `Could not read \`${file}\`: ${e instanceof Error ? e.message : e}` };
  }
}

function checklist(): string {
  const { fields, error } = manualFields();
  if (error) return `> ${error}`;
  if (!fields.length) return "_No manual fields found in the template._";
  const stale = fields.filter((f) => f.stale && !f.carryForward);
  const lines = fields.map((f) => {
    const done = !f.stale || f.carryForward;
    const bits = [
      f.source ? `[source](${f.source})` : "no source link",
      f.timing ? `expected: ${f.timing}` : null,
      f.asOf ? `as of ${f.asOf}` : null,
      f.required ? "**required**" : null,
      f.carryForward ? "carried forward" : null,
    ].filter(Boolean);
    return `- [${done ? "x" : " "}] **${f.label}** (\`${f.id}\`) · ${bits.join(" · ")}`;
  });
  const requiredStale = stale.filter((f) => f.required).length;
  return [
    `${fields.length} manual fields; **${stale.length} still stale**${requiredStale ? ` (${requiredStale} required: the build fails until these are updated or set \`carry_forward: true\` with a reason)` : ""}. Ticked = updated this month.`,
    "",
    ...lines,
  ].join("\n");
}

function readOr(file: string | undefined, fallback: string): string {
  if (file && fs.existsSync(file)) {
    const t = fs.readFileSync(file, "utf8").trim();
    if (t) return t;
  }
  return fallback;
}

function statusLine(): string {
  const b =
    buildStatus === undefined ? null : buildStatus === "0" ? "Build: passed" : buildStatus === "skipped" ? "Build: not re-run (only the edition JSON changed)" : "Build: **failed** (see the log below; usually stale required manual fields)";
  const v = validateStatus === undefined ? null : validateStatus === "0" ? "Validation: passed" : "Validation: **FAIL** (must be fixed before merging)";
  return [b, v].filter(Boolean).join(" · ");
}

function tail(text: string, lines = 60): string {
  const all = text.split("\n");
  return all.slice(-lines).join("\n");
}

const repo = process.env.GITHUB_REPOSITORY;
const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const branch = `edition/${id}`;
const fileLink = (p: string, edit = false) => (repo ? `[\`${p}\`](${server}/${repo}/${edit ? "edit" : "blob"}/${branch}/${p})` : `\`${p}\``);

const report = readOr(opt("--report"), "_No validation report was produced._");
const buildLog = buildStatus && buildStatus !== "0" && buildStatus !== "skipped" ? readOr(opt("--build-log"), "") : "";
const manualPath = `data/manual/${id}.yaml`;
const editionPath = `data/editions/${id}.json`;

const parts: string[] = [];
if (kind === "body") {
  parts.push(
    `Automated draft of the **${id}** edition (spec 12.1). Nothing is published until this PR is merged.`,
    "",
    statusLine(),
    "",
    "### What to do",
    `1. Open ${fileLink(manualPath, true)} and, for each unticked field below, click the source link, update the value and as-of date, and set \`stale: false\`. GitHub's web editor is fine. Each save re-runs the build and validation and updates the comment below.`,
    `2. Read the text in ${fileLink(editionPath, true)} (month in brief, big picture, bullets) and edit it for accuracy and neutrality.`,
    "3. Check the Vercel preview (Vercel posts the link on this PR) on desktop and phone.",
    `4. When it looks right, set "status": "ready" in ${editionPath} and merge. Merging sends the email.`,
    "",
    "### Manual fields",
    checklist(),
    "",
    "### Validation report",
    report,
  );
} else {
  parts.push(COMMENT_MARKER, `### Validation for ${id}`, "", statusLine(), "", report, "", "<details><summary>Manual fields</summary>", "", checklist(), "", "</details>");
}
if (buildLog) {
  parts.push("", "<details><summary>Build log (last 60 lines)</summary>", "", "```", tail(buildLog), "```", "", "</details>");
}
parts.push("", `<sub>Updated ${new Date().toISOString().replace(/\.\d+Z$/, "Z")} by the monthly-update workflow.</sub>`);

let md = parts.join("\n");
if (md.length > MAX) md = md.slice(0, MAX) + "\n\n…(truncated; see the workflow run for the full report)";
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, md + "\n");
console.log(`Wrote ${outFile} (${md.length} chars)`);
