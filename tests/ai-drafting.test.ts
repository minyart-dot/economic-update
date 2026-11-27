// AI drafter and audit (spec 12.1 step 5, 14.4, Appendix E) with an injected fake client.
// No test touches the network: every request goes to FakeClient, which records it.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { DEFAULT_MODEL, buildParams, modelFromEnv, requestJson, type AiClient } from "../scripts/lib/ai";
import { AUDIT_SYSTEM_PROMPT, auditEdition, renderAudit, type Audit } from "../scripts/lib/audit";
import {
  APPENDIX_E,
  DRAFT_SYSTEM_PROMPT,
  checkShape,
  compactEdition,
  draftSummary,
  draftUserMessage,
  renderDraftBody,
  sentenceCount,
  validatorFindings,
  type Draft,
} from "../scripts/lib/draft-summary";
import { loadEditionAt, loadMetricsConfigAt, loadSourcesAt } from "../scripts/lib/io";
import { FIXTURE } from "./helpers";

const EDITION = loadEditionAt(FIXTURE, "2030-01");
const CFG = loadMetricsConfigAt(FIXTURE);
const CTX = { edition: EDITION, cfg: CFG, sources: loadSourcesAt(FIXTURE) };

class FakeClient implements AiClient {
  calls: MessageCreateParamsNonStreaming[] = [];
  constructor(private replies: (object | string)[], private extra: Partial<BetaMessage> = {}) {}
  async create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage> {
    this.calls.push(params);
    const r = this.replies.shift();
    if (r === undefined) throw new Error("FakeClient: no reply left");
    return {
      id: `msg_${this.calls.length}`,
      type: "message",
      role: "assistant",
      model: params.model,
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "", signature: "x" },
        { type: "text", text: typeof r === "string" ? r : JSON.stringify(r), citations: null },
      ],
      ...this.extra,
    } as unknown as BetaMessage;
  }
}

const userText = (p: MessageCreateParamsNonStreaming) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : JSON.stringify(c);
};

const GOOD: Draft = {
  month_in_brief:
    "Rate A was 5.0% in Dec, up from a year earlier. Price B was 100 in Dec. Index C fell to 45 in Jan. The Q4 count was 1,200.",
  big_picture: "Rates were higher than a year earlier. Index C was lower in Jan.",
  themes: [
    { name: "Housing", bullets: ["Price B was 100 in Dec.", "Rents were $1,500/mo in Dec."], other_side: "Other side: Index C was 45 in Jan." },
    { name: "Building pipeline", bullets: ["The Q4 count was 1,200.", "Level E was 61.5 in Q3."], other_side: "Level E was 60.0 a year earlier." },
    { name: "Jobs", bullets: ["Auto F was 50 in Dec.", "Index C was 45 in Jan."], other_side: "Other side: Auto F was 48 a year earlier." },
    { name: "Household credit", bullets: ["Rate A was 5.0% in Dec.", "Price B was 100 in Dec."], other_side: "Other side: Rate A was 4.0% a year earlier." },
  ],
  email_subject: "January brief: Rate A at 5.0%, Index C at 45",
};
const BAD: Draft = {
  ...GOOD,
  month_in_brief: "Rate A was 7.77% in Dec. Prices will rise. Index C was 45 in Jan. The Q4 count was 1,200.",
};

// ---------------------------------------------------------------- request shape

test("model defaults to the most capable model and is overridable with ANTHROPIC_MODEL", () => {
  assert.equal(modelFromEnv({}), DEFAULT_MODEL);
  assert.equal(modelFromEnv({ ANTHROPIC_MODEL: " claude-sonnet-5-5 " }), "claude-sonnet-5-5");
  const p = buildParams({ model: DEFAULT_MODEL, system: "s", user: "u", schema: { type: "object" } });
  assert.deepEqual(p.thinking, { type: "adaptive" });
  assert.equal(p.output_config?.format?.type, "json_schema");
  assert.equal(p.fallbacks, "default");
  const other = buildParams({ model: "claude-haiku-5-5", system: "s", user: "u", schema: {} });
  assert.equal(other.fallbacks, undefined);
  assert.equal(other.betas, undefined);
});

test("requestJson rejects refusals and invalid JSON", async () => {
  await assert.rejects(requestJson(new FakeClient([{}], { stop_reason: "refusal" }), { model: "m", system: "s", user: "u", schema: {} }), /declined/);
  await assert.rejects(requestJson(new FakeClient(["not json"]), { model: "m", system: "s", user: "u", schema: {} }), /not valid JSON/);
});

test("system prompt is Appendix E verbatim plus the JSON format note", () => {
  assert.ok(DRAFT_SYSTEM_PROMPT.startsWith(APPENDIX_E));
  for (const rule of [
    "Use ONLY numbers present in the JSON",
    "Banned words: will, expect, forecast, likely, poised, bubble, crash, opportunity, should.",
    'Use "while" or "alongside" instead of "because" or "driving".',
    "never pair different periods without labeling each",
    "four themes (Housing, Building pipeline, Jobs, Household credit)",
    "under 70 characters",
  ]) {
    assert.ok(DRAFT_SYSTEM_PROMPT.includes(rule), rule);
  }
});

test("prompt payload carries the required metric fields and only numbers from the edition", () => {
  const c = compactEdition(EDITION, CFG);
  const rate = c.metrics.find((m) => m.id === "rate_a")!;
  for (const k of ["label", "display", "period_label", "year_ago", "direction", "color", "source_name"]) assert.ok(k in rate, k);
  assert.ok(c.metrics.find((m) => m.id === "index_c")!.notes);
  assert.deepEqual(c.metrics.find((m) => m.id === "change_g")!.change_reported_yy, { pct: -2 });
  const user = draftUserMessage(EDITION, CFG);
  assert.deepEqual(validatorFindings(CTX, user), [], "every number in the user message must exist in the edition");
});

// ---------------------------------------------------------------- rendering and checks

test("Markdown rendering has every section and one Other side bullet per theme", () => {
  const md = renderDraftBody(GOOD);
  for (const h of ["## month_in_brief", "## big_picture", "### Housing", "### Building pipeline", "### Jobs", "### Household credit", "## Email subject"]) {
    assert.ok(md.includes(h), h);
  }
  assert.equal((md.match(/^- Other side: /gm) ?? []).length, 4);
  assert.ok(!md.includes("Other side: Other side:"));
  assert.ok(md.includes("- Other side: Level E was 60.0 a year earlier."), "prefix added when missing");
  assert.deepEqual(validatorFindings(CTX, md), []);
});

test("shape checks: word limit, theme order, bullet count, subject length", () => {
  assert.deepEqual(checkShape(GOOD).failures, []);
  const long: Draft = {
    ...GOOD,
    month_in_brief: Array(95).fill("word").join(" ") + ".",
    themes: [GOOD.themes[1], GOOD.themes[0], { ...GOOD.themes[2], bullets: ["one"] }, GOOD.themes[3]],
    email_subject: "x".repeat(70),
  };
  const f = checkShape(long).failures.join("\n");
  assert.match(f, /95 words/);
  assert.match(f, /in that order/);
  assert.match(f, /1 factual bullets/);
  assert.match(f, /70 characters/);
  assert.equal(sentenceCount("U.S. sales fell 3.5% vs. a year ago. Prices rose."), 2);
});

// ---------------------------------------------------------------- the drafting loop

test("a passing first draft makes one call and has no failure header", async () => {
  const client = new FakeClient([GOOD]);
  const res = await draftSummary({ ...CTX, client, model: DEFAULT_MODEL, id: "2030-01" });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].system, DRAFT_SYSTEM_PROMPT);
  assert.equal(res.attempts, 1);
  assert.deepEqual(res.failures, []);
  assert.ok(!res.markdown.includes("VALIDATION FAILED"));
  assert.ok(res.markdown.startsWith("# AI draft summary: edition 2030-01"));
  assert.ok(res.markdown.includes("data/editions/2030-01.json"));
});

test("a failing draft is retried once with the validator findings appended", async () => {
  const client = new FakeClient([BAD, GOOD]);
  const res = await draftSummary({ ...CTX, client, model: DEFAULT_MODEL, id: "2030-01" });
  assert.equal(client.calls.length, 2);
  const retry = userText(client.calls[1]);
  assert.ok(retry.startsWith(userText(client.calls[0])), "retry repeats the original request");
  assert.match(retry, /Number 7\.77 is not in the edition JSON/);
  assert.match(retry, /Banned word "will"/);
  assert.match(retry, /<previous_draft>/);
  assert.equal(res.attempts, 2);
  assert.deepEqual(res.failures, []);
  assert.ok(!res.markdown.includes("VALIDATION FAILED"));
  assert.match(res.markdown, /after one retry/);
});

test("a draft that still fails is written with a VALIDATION FAILED header listing the problems", async () => {
  const client = new FakeClient([BAD, BAD]);
  const res = await draftSummary({ ...CTX, client, model: DEFAULT_MODEL, id: "2030-01" });
  assert.equal(client.calls.length, 2, "only one retry");
  const head = res.markdown.split("## month_in_brief")[0];
  assert.match(head, /VALIDATION FAILED/);
  assert.match(head, /- Number 7\.77 is not in the edition JSON/);
  assert.match(head, /- Banned word "will"/);
  assert.ok(res.markdown.includes("Rate A was 7.77% in Dec."), "the draft is still written for review");
});

test("draft-summary CLI never writes into data/editions and needs a key", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "draft-summary.ts"), "utf8");
  assert.match(src, /Refusing to write into data\/editions/);
  assert.match(src, /ANTHROPIC_API_KEY/);
});

// ---------------------------------------------------------------- audit

const AUDIT: Audit = {
  findings: [
    {
      location: "themes[0].bullets[1].text",
      category: "causal_claim",
      issue: "Says prices fell because of rates; no cited cause.",
      suggested_rewrite: "Prices fell while rates rose.",
    },
    { location: "draft: month_in_brief", category: "unlabeled_periods", issue: "Pairs Dec and Q4 figures\nwithout labels.", suggested_rewrite: "Label each period." },
  ],
};

test("audit is a separate call with its own prompt and gets the edition and the draft", async () => {
  const client = new FakeClient([AUDIT]);
  const res = await auditEdition({ client, model: DEFAULT_MODEL, id: "2030-01", edition: EDITION, cfg: CFG, draft: "DRAFT TEXT", draftPath: "data/drafts/2030-01-summary.md" });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].system, AUDIT_SYSTEM_PROMPT);
  assert.notEqual(AUDIT_SYSTEM_PROMPT, DRAFT_SYSTEM_PROMPT);
  assert.match(AUDIT_SYSTEM_PROMPT, /skeptical economist/);
  const u = userText(client.calls[0]);
  assert.match(u, /<draft>\nDRAFT TEXT\n<\/draft>/);
  assert.match(u, /"rate_a"/);
  assert.match(u, /"comparison_basis":"y\/y"/);
  assert.ok(!u.includes('"build"'));
  assert.equal(res.audit.findings.length, 2);
});

test("audit output is a numbered list of location, issue and suggested rewrite", () => {
  const md = renderAudit({ id: "2030-01", model: "m", draftPath: "data/drafts/2030-01-summary.md", audit: AUDIT });
  assert.match(md, /^## Independent AI audit: edition 2030-01/);
  assert.match(md, /It only reports; you decide/);
  assert.match(md, /\*\*2 findings\*\*/);
  assert.match(md, /^1\. \*\*Unsupported causal claim\*\* · `themes\[0\]\.bullets\[1\]\.text`$/m);
  assert.match(md, /^ {3}- Issue: Says prices fell because of rates; no cited cause\.$/m);
  assert.match(md, /^ {3}- Suggested neutral rewrite: Prices fell while rates rose\.$/m);
  assert.match(md, /^2\. \*\*Unlabeled periods\*\* · `draft: month_in_brief`$/m);
  assert.match(md, /Pairs Dec and Q4 figures without labels\./, "newlines collapsed");
  assert.match(renderAudit({ id: "2030-01", model: "m", draftPath: null, audit: { findings: [] } }), /\*\*No findings\.\*\*/);
});

test("audit without a draft says so", async () => {
  const client = new FakeClient([{ findings: [] }]);
  await auditEdition({ client, model: DEFAULT_MODEL, id: "2030-01", edition: EDITION, cfg: CFG, draft: null, draftPath: null });
  assert.match(userText(client.calls[0]), /No AI draft this month/);
});

test("PR body includes the draft and audit when passed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-ai-"));
  const draft = path.join(dir, "d.md");
  const audit = path.join(dir, "a.md");
  const out = path.join(dir, "body.md");
  fs.writeFileSync(draft, "# AI draft summary: edition 2026-11\n\n> **VALIDATION FAILED.**\n");
  fs.writeFileSync(audit, "## Independent AI audit: edition 2026-11\n\n**No findings.**\n");
  const { execFileSync } = await import("node:child_process");
  const root = path.join(__dirname, "..");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/edition-pr-body.ts", "2026-11", "--kind", "body", "--out", out, "--draft", draft, "--audit", audit], {
    cwd: root,
    env: { ...process.env, GITHUB_REPOSITORY: "" },
    stdio: "pipe",
  });
  const body = fs.readFileSync(out, "utf8");
  assert.match(body, /### AI draft summary \(optional, for review\)/);
  assert.match(body, /<details><summary>[^<]*\(VALIDATION FAILED: see the header\)<\/summary>/);
  assert.match(body, /### Independent AI audit \(optional\)/);
  assert.match(body, /\*\*No findings\.\*\*/);
  // Without the options the sections are absent.
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/edition-pr-body.ts", "2026-11", "--kind", "body", "--out", out], { cwd: root, stdio: "pipe" });
  assert.ok(!fs.readFileSync(out, "utf8").includes("AI draft summary"));
  // A failed step passes an empty path: a note instead of an older file.
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/edition-pr-body.ts", "2026-11", "--kind", "body", "--out", out, "--draft", ""], { cwd: root, stdio: "pipe" });
  assert.match(fs.readFileSync(out, "utf8"), /### AI draft summary[^\n]*\n_This step ran but produced no file/);
});
