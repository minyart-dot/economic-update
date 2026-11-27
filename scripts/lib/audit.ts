// Optional independent AI audit (spec 14.4). A second Claude call, separate from the drafter,
// reviews the edition JSON and the draft as a skeptical economist and lists findings. It only
// reports: nothing is changed, and a human decides what to act on.

import { enrichMetrics } from "../../lib/edition";
import type { EditionSeed, MetricsFile } from "../../lib/types";
import { requestJson, type AiClient } from "./ai";

export const AUDIT_CATEGORIES = [
  "comparison_basis",
  "mixed_sources",
  "unlabeled_periods",
  "causal_claim",
  "since_claim",
  "tone",
  "other",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  comparison_basis: "Comparison basis",
  mixed_sources: "Mixed sources",
  unlabeled_periods: "Unlabeled periods",
  causal_claim: "Unsupported causal claim",
  since_claim: "Unsupported \"since\" claim",
  tone: "Tone",
  other: "Other",
};

export const AUDIT_SYSTEM_PROMPT = `You are a skeptical economist auditing the monthly "State of the Market" brief for real estate investors before it is published. You receive the edition JSON (every metric with its value, period, year-ago value, computed y/y change, direction, color and source; plus all reader-facing text) and, if available, an AI-drafted summary. Review the text and report problems. You only report; a human decides what to change.

Check for:
1. comparison_basis: every arrow and every unqualified change must be year over year (same period one year earlier). Flag m/m, YTD, vs. 2019, peak or average comparisons that are not spelled out in words, and arrows or "up/down" statements whose basis is not y/y.
2. mixed_sources: figures from different sources or methods presented as one series or trend (e.g. CBRE vs. Moody's office vacancy, MHI shipments vs. MHARR production).
3. unlabeled_periods: figures from different periods paired in one statement without labeling each period (e.g. an October price next to Q3 supply).
4. causal_claim: "because", "driving", "due to", "led to" or similar causal language not backed by a cited cause in the metric notes.
5. since_claim: "highest/lowest since YEAR", "first time since", "Nth straight" claims not backed by the data or the metric's notes/footnote.
6. tone: forecasts, advice, or loaded words (will, expect, likely, poised, bubble, crash, opportunity, should), and wording that is not neutral.
7. other: a number in the text that does not match the metric data, or anything else a careful economist would challenge.

For each finding give: the location (a JSON path such as "themes[1].bullets[0].text" or "draft: month_in_brief"), the category, the issue in one or two plain sentences, and a suggested neutral rewrite that uses only numbers already in the JSON. Do not invent data. Report only real problems; an empty list is a valid answer. Do not repeat the same issue for every place it occurs: name the first location and say it recurs.`;

export interface AuditFinding {
  location: string;
  category: AuditCategory;
  issue: string;
  suggested_rewrite: string;
}
export interface Audit {
  findings: AuditFinding[];
}

export const AUDIT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["location", "category", "issue", "suggested_rewrite"],
        properties: {
          location: { type: "string" },
          category: { type: "string", enum: [...AUDIT_CATEGORIES] },
          issue: { type: "string" },
          suggested_rewrite: { type: "string" },
        },
      },
    },
  },
};

/** The edition as the auditor sees it: all text, with metrics replaced by their computed records. */
export function auditPayload(edition: EditionSeed, cfg: MetricsFile) {
  const metrics = enrichMetrics(edition, cfg);
  const { build: _build, metrics: _raw, ...rest } = edition;
  void _build;
  void _raw;
  return {
    ...rest,
    metrics: Object.fromEntries(
      Object.values(metrics).map((m) => [
        m.id,
        {
          label: m.label,
          display: m.display,
          period_label: m.period_label,
          year_ago: m.year_ago_display,
          year_ago_label: edition.metrics[m.id].year_ago_label ?? null,
          change_abs: m.change_abs,
          change_pct: m.change_pct,
          change_reported: m.change_reported,
          comparison_basis: m.comparison_basis,
          direction: m.direction,
          color: m.color,
          polarity: m.polarity,
          source_name: m.source_name,
          footnote: m.footnote,
          notes: m.notes,
        },
      ]),
    ),
  };
}

export function auditUserMessage(edition: EditionSeed, cfg: MetricsFile, draft: string | null): string {
  return [
    "Audit this edition and draft.",
    "",
    "<edition>",
    JSON.stringify(auditPayload(edition, cfg)),
    "</edition>",
    "",
    draft ? `<draft>\n${draft}\n</draft>` : "<draft>No AI draft this month.</draft>",
  ].join("\n");
}

function isAudit(x: unknown): x is Audit {
  const o = x as Audit;
  return (
    !!o &&
    Array.isArray(o.findings) &&
    o.findings.every((f) => f && typeof f.location === "string" && typeof f.issue === "string" && typeof f.suggested_rewrite === "string")
  );
}

const one = (s: string) => s.replace(/\s+/g, " ").trim();

export function renderAudit(opts: { id: string; model: string; draftPath: string | null; audit: Audit }): string {
  const { id, model, draftPath, audit } = opts;
  const n = audit.findings.length;
  const L = [
    `## Independent AI audit: edition ${id}`,
    "",
    `> A separate Claude call (\`${model}\`) acting as a skeptical economist (spec 14.4) reviewed \`data/editions/${id}.json\`${draftPath ? ` and \`${draftPath}\`` : ""} for comparison basis, mixed sources, unlabeled periods, unsupported causal and "since" claims, and tone. It only reports; you decide what to change. Check each point against the source before editing.`,
    "",
    n ? `**${n} finding${n === 1 ? "" : "s"}**` : "**No findings.**",
    "",
  ];
  audit.findings.forEach((f, i) => {
    const cat = CATEGORY_LABEL[f.category as AuditCategory] ?? one(String(f.category));
    L.push(
      `${i + 1}. **${cat}** · \`${one(f.location)}\``,
      `   - Issue: ${one(f.issue)}`,
      `   - Suggested neutral rewrite: ${one(f.suggested_rewrite) || "_none_"}`,
    );
  });
  L.push("");
  return L.join("\n");
}

export async function auditEdition(opts: {
  client: AiClient;
  model: string;
  id: string;
  edition: EditionSeed;
  cfg: MetricsFile;
  draft: string | null;
  draftPath: string | null;
}): Promise<{ markdown: string; audit: Audit; model: string }> {
  const { data, model } = await requestJson<unknown>(opts.client, {
    model: opts.model,
    system: AUDIT_SYSTEM_PROMPT,
    user: auditUserMessage(opts.edition, opts.cfg, opts.draft),
    schema: AUDIT_SCHEMA,
  });
  if (!isAudit(data)) throw new Error("The audit response did not match the schema.");
  return { markdown: renderAudit({ id: opts.id, model, draftPath: opts.draftPath, audit: data }), audit: data, model };
}
