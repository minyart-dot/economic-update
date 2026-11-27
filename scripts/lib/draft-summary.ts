// Optional AI summary drafter (spec 12.1 step 5, Appendix E). Drafts text for the owner to review;
// it never writes into data/editions/. The draft is checked with the validator's draft-summary rules
// (numbers must exist in the edition JSON ±0.05, no banned words), retried once with the findings,
// and written with a "VALIDATION FAILED" header if it still fails.

import { enrichMetrics } from "../../lib/edition";
import type { EditionSeed, MetricsFile, SourceEntry } from "../../lib/types";
import { requestJson, type AiClient } from "./ai";
import { validateEdition } from "./validate";

/** Appendix E of the spec, verbatim (line breaks from the PDF re-joined). */
export const APPENDIX_E = `You draft the monthly "State of the Market" text for real estate investors. You will receive a JSON edition with every metric, its value, period, year-ago value, direction, color and source.
Rules:
1. Use ONLY numbers present in the JSON, with their periods. Never estimate, round differently than the "display" field, or introduce outside facts.
2. Be neutral. Describe what happened; do not forecast or advise. Banned words: will, expect, forecast, likely, poised, bubble, crash, opportunity, should.
3. No causal claims unless the JSON "notes" include a cited cause. Use "while" or "alongside" instead of "because" or "driving".
4. Never compare figures from different sources as one series; never pair different periods without labeling each.
5. Output Markdown with: (a) "month_in_brief": 4–5 sentences, under 90 words; (b) "big_picture": 2–3 sentences; (c) four themes (Housing, Building pipeline, Jobs, Household credit), each with 2 factual bullets and 1 bullet starting "Other side:"; (d) one neutral email subject line under 70 characters.
6. Plain English for non-economists. Short sentences.`;

/** Appended so the response is machine-readable; the tool renders the Markdown from it. */
const FORMAT_NOTE = `
Output format for this tool: return the parts of rule 5 as JSON matching the provided schema instead of Markdown; the tool renders the Markdown. Put each theme's two factual bullets in "bullets" and its counterpoint in "other_side", starting with "Other side:". Every comparison is year over year (y/y) unless you spell out another basis in words. Write "since" phrases (e.g. "lowest since 2012") only when a metric's notes or footnote state them.`;

export const DRAFT_SYSTEM_PROMPT = APPENDIX_E + "\n" + FORMAT_NOTE;

export const THEMES = ["Housing", "Building pipeline", "Jobs", "Household credit"] as const;

export interface DraftTheme {
  name: (typeof THEMES)[number];
  bullets: string[];
  other_side: string;
}
export interface Draft {
  month_in_brief: string;
  big_picture: string;
  themes: DraftTheme[];
  email_subject: string;
}

export const DRAFT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["month_in_brief", "big_picture", "themes", "email_subject"],
  properties: {
    month_in_brief: { type: "string", description: "4–5 sentences, under 90 words." },
    big_picture: { type: "string", description: "2–3 sentences." },
    themes: {
      type: "array",
      description: "Exactly four themes, in this order: Housing, Building pipeline, Jobs, Household credit.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "bullets", "other_side"],
        properties: {
          name: { type: "string", enum: [...THEMES] },
          bullets: { type: "array", items: { type: "string" }, description: "Exactly two factual bullets." },
          other_side: { type: "string", description: 'The strongest counterpoint from the data, starting with "Other side:".' },
        },
      },
    },
    email_subject: { type: "string", description: "One neutral email subject line under 70 characters." },
  },
};

// ---------------------------------------------------------------- the prompt payload

/**
 * The compact edition the drafter sees: each metric's label, display, period, year-ago display,
 * direction, color and source, plus footnotes and notes. Nothing is computed or rounded here;
 * every string comes from the edition (or lib/edition.ts formatting of its values).
 */
export function compactEdition(edition: EditionSeed, cfg: MetricsFile) {
  const metrics = enrichMetrics(edition, cfg);
  return {
    edition: edition.edition_label,
    data_as_of: edition.data_as_of_label,
    comparison_basis: "y/y (same period one year earlier)",
    metrics: Object.values(metrics)
      .filter((m) => m.value != null)
      .map((m) => {
        const seed = edition.metrics[m.id];
        const yaLabel = seed.year_ago_label ?? null;
        return {
          id: m.id,
          label: m.label,
          display: m.display,
          period_label: m.period_label,
          year_ago: m.year_ago_display ? (yaLabel ? `${m.year_ago_display} (${yaLabel})` : m.year_ago_display) : null,
          ...(m.change_reported ? { change_reported_yy: m.change_reported } : {}),
          direction: m.direction,
          color: m.color,
          source_name: m.source_name,
          ...(m.footnote ? { footnote: m.footnote } : {}),
          ...(m.notes ? { notes: m.notes } : {}),
          ...(seed.stale || seed.carried_forward ? { not_updated_this_month: true } : {}),
        };
      }),
    notes: edition.notes,
  };
}

export function draftUserMessage(edition: EditionSeed, cfg: MetricsFile): string {
  return [
    "Draft the month's text from this edition JSON, following the rules.",
    "",
    "<edition>",
    JSON.stringify(compactEdition(edition, cfg), null, 1),
    "</edition>",
  ].join("\n");
}

export function retryUserMessage(base: string, previous: Draft, problems: string[]): string {
  return [
    base,
    "",
    "Your previous draft (below) failed the automatic checks listed after it. Write a corrected draft: remove or replace every flagged number with one that appears in the edition JSON, and avoid the banned words.",
    "",
    "<previous_draft>",
    JSON.stringify(previous, null, 1),
    "</previous_draft>",
    "",
    "<check_failures>",
    ...problems.map((p) => `- ${p}`),
    "</check_failures>",
  ].join("\n");
}

// ---------------------------------------------------------------- rendering and checks

const strip = (s: string) => s.replace(/\s+/g, " ").trim();
const otherSide = (s: string) => `Other side: ${strip(s).replace(/^other side:\s*/i, "")}`;

/** The draft body as Markdown (no header): the text the validator checks. */
export function renderDraftBody(d: Draft): string {
  const L = ["## month_in_brief", "", strip(d.month_in_brief), "", "## big_picture", "", strip(d.big_picture), "", "## Themes", ""];
  for (const t of d.themes) {
    L.push(`### ${t.name}`, "", ...t.bullets.map((b) => `- ${strip(b)}`), `- ${otherSide(t.other_side)}`, "");
  }
  L.push("## Email subject", "", strip(d.email_subject), "");
  return L.join("\n");
}

export const wordCount = (s: string) => strip(s).split(" ").filter(Boolean).length;

/** Rough sentence count; ignores dots in decimals and common abbreviations (U.S., vs., e.g.). */
export function sentenceCount(s: string): number {
  const t = strip(s).replace(/\b(U\.S|U\.K|e\.g|i\.e|vs|approx|avg|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|No|St|Mt)\./g, "$1");
  return t.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;
}

export interface DraftCheck {
  /** Must-fix problems: validator FAILs on the draft and hard shape rules. Trigger the retry. */
  failures: string[];
  /** Soft notes (heuristic sentence counts), shown in the header but never block. */
  notes: string[];
}

export function checkShape(d: Draft): DraftCheck {
  const failures: string[] = [];
  const notes: string[] = [];
  const words = wordCount(d.month_in_brief);
  if (words >= 90) failures.push(`month_in_brief has ${words} words; it must be under 90.`);
  const s1 = sentenceCount(d.month_in_brief);
  if (s1 < 4 || s1 > 5) notes.push(`month_in_brief looks like ${s1} sentences (target 4–5).`);
  const s2 = sentenceCount(d.big_picture);
  if (s2 < 2 || s2 > 3) notes.push(`big_picture looks like ${s2} sentences (target 2–3).`);
  const names = d.themes.map((t) => t.name);
  if (names.join("|") !== THEMES.join("|")) failures.push(`Themes must be exactly ${THEMES.join(", ")} in that order; got: ${names.join(", ") || "none"}.`);
  for (const t of d.themes) {
    if (t.bullets.length !== 2) failures.push(`Theme "${t.name}" has ${t.bullets.length} factual bullets; it needs exactly 2.`);
    if (!strip(t.other_side).replace(/^other side:\s*/i, "")) failures.push(`Theme "${t.name}" has an empty "Other side:" bullet.`);
  }
  const subj = strip(d.email_subject);
  if (!subj) failures.push("The email subject is empty.");
  else if (subj.length >= 70) failures.push(`The email subject has ${subj.length} characters; it must be under 70.`);
  return { failures, notes };
}

export interface DraftValidationContext {
  edition: EditionSeed;
  cfg: MetricsFile;
  sources: SourceEntry[];
}

/** The validator's draft-summary rules (spec 14.3): numbers in the edition ±0.05, banned words. */
export function validatorFindings(ctx: DraftValidationContext, body: string): string[] {
  return validateEdition({ edition: ctx.edition, cfg: ctx.cfg, sources: ctx.sources, previous: null, draftSummary: body })
    .filter((f) => f.where === "draft summary" && f.level === "FAIL")
    .map((f) => f.message);
}

export function checkDraft(ctx: DraftValidationContext, d: Draft): DraftCheck & { body: string } {
  const body = renderDraftBody(d);
  const shape = checkShape(d);
  return { body, failures: [...validatorFindings(ctx, body), ...shape.failures], notes: shape.notes };
}

export function isDraft(x: unknown): x is Draft {
  const o = x as Draft;
  return (
    !!o &&
    typeof o.month_in_brief === "string" &&
    typeof o.big_picture === "string" &&
    typeof o.email_subject === "string" &&
    Array.isArray(o.themes) &&
    o.themes.every((t) => t && typeof t.name === "string" && Array.isArray(t.bullets) && t.bullets.every((b) => typeof b === "string") && typeof t.other_side === "string")
  );
}

/** The full file: a review header (and the failures, if any) followed by the draft body. */
export function renderDraftFile(opts: { id: string; model: string; attempts: number; check: DraftCheck & { body: string } }): string {
  const { id, model, attempts, check } = opts;
  const L = [`# AI draft summary: edition ${id}`, ""];
  if (check.failures.length) {
    L.push(
      "> **VALIDATION FAILED.** This draft still breaks the checks below after a retry. Fix or discard these parts before using any of it.",
      "",
      ...check.failures.map((f) => `- ${f}`),
      "",
    );
  }
  L.push(
    `> Drafted by Claude (\`${model}\`, ${attempts === 1 ? "first attempt" : "after one retry"}) for the owner to review. Nothing here is published: copy any text you keep into \`data/editions/${id}.json\` by hand, checking each figure against its source.`,
    `> Checks: every number present in the edition JSON, banned words, theme and length rules: ${check.failures.length ? "**failed**" : "passed"}.`,
    "",
  );
  if (check.notes.length) L.push(...check.notes.map((n) => `> Note: ${n}`), "");
  L.push(check.body);
  return L.join("\n");
}

// ---------------------------------------------------------------- the run

export interface DraftResult {
  markdown: string;
  draft: Draft;
  attempts: number;
  failures: string[];
  model: string;
}

export async function draftSummary(opts: DraftValidationContext & { client: AiClient; model: string; id: string }): Promise<DraftResult> {
  const { client, model, id } = opts;
  const base = draftUserMessage(opts.edition, opts.cfg);
  const ask = async (user: string) => {
    const { data, model: served } = await requestJson<unknown>(client, { model, system: DRAFT_SYSTEM_PROMPT, user, schema: DRAFT_SCHEMA });
    if (!isDraft(data)) throw new Error("The response did not match the draft schema.");
    return { draft: data, served };
  };

  let { draft, served } = await ask(base);
  let check = checkDraft(opts, draft);
  let attempts = 1;
  if (check.failures.length) {
    attempts = 2;
    ({ draft, served } = await ask(retryUserMessage(base, draft, check.failures)));
    check = checkDraft(opts, draft);
  }
  return { markdown: renderDraftFile({ id, model: served, attempts, check }), draft, attempts, failures: check.failures, model: served };
}
