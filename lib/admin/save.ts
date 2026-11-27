// The save step behind POST /api/admin/save, kept free of Next.js so tests can run it against a
// local GitHub stand-in: read the file from the edition branch, check it is the version the form was
// loaded from, validate every entry with the same rules as the form, apply only the changed keys,
// and write it back with the old sha.

import type { GitHubConfig } from "./config";
import { type EntryPatch, type FieldErrors, type FieldForm, entryPatch, validateField } from "./fields";
import { ConflictError, findPullRequest, getManualFile, putManualFile } from "./github";
import { applyPatches, parseManual } from "./manual-yaml";
import { assertEditionId } from "./paths";

export interface SaveRequest {
  edition: string;
  sha: string;
  fields: Record<string, FieldForm>;
}

export type SaveOutcome =
  | { kind: "saved"; commitUrl: string; commitSha: string; fileSha: string; prUrl: string | null; changed: string[]; inPlace: boolean }
  | { kind: "unchanged" }
  | { kind: "invalid"; errors: Record<string, FieldErrors>; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "missing"; message: string };

const FORM_KEYS: (keyof FieldForm)[] = [
  "status", "value", "display", "period", "period_label", "as_of", "year_ago", "year_ago_display",
  "year_ago_period", "change_pct", "change_points", "source_url", "reason",
];

/** Checks the JSON body's shape; returns null when it is not a save request. */
export function parseSaveRequest(body: unknown): SaveRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.edition !== "string" || typeof b.sha !== "string" || !b.fields || typeof b.fields !== "object") return null;
  try {
    assertEditionId(b.edition);
  } catch {
    return null;
  }
  const fields: Record<string, FieldForm> = {};
  const entries = Object.entries(b.fields as Record<string, unknown>);
  if (entries.length > 500) return null;
  for (const [id, f] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(id) || !f || typeof f !== "object") return null;
    const r = f as Record<string, unknown>;
    const form = {} as FieldForm;
    for (const k of FORM_KEYS) {
      const v = r[k] ?? "";
      if (typeof v !== "string") return null;
      (form as unknown as Record<string, string>)[k] = v;
    }
    fields[id] = form;
  }
  return { edition: b.edition, sha: b.sha, fields };
}

export async function saveManual(cfg: GitHubConfig, req: SaveRequest): Promise<SaveOutcome> {
  const file = await getManualFile(cfg, req.edition);
  if (!file) return { kind: "missing", message: `data/manual/${req.edition}.yaml is not on branch edition/${req.edition}.` };
  if (file.sha !== req.sha) return { kind: "conflict", message: new ConflictError().message };

  const manual = parseManual(file.text);
  const errors: Record<string, FieldErrors> = {};
  const patches: Record<string, EntryPatch> = {};
  for (const [id, form] of Object.entries(req.fields)) {
    const orig = manual.metrics[id];
    if (!orig) {
      errors[id] = { status: `"${id}" is not in the file any more. Reload the page.` };
      continue;
    }
    // Which optional lines exist comes from the file, never from the browser.
    const meta = {
      has_display: orig.display !== undefined,
      has_year_ago_display: orig.year_ago_display !== undefined,
      has_change_reported: orig.change_reported !== undefined,
    };
    const e = validateField(meta, form);
    if (Object.keys(e).length) {
      errors[id] = e;
      continue;
    }
    const p = entryPatch(orig, meta, form);
    if (Object.keys(p).length) patches[id] = p;
  }
  if (Object.keys(errors).length) {
    const n = Object.keys(errors).length;
    return { kind: "invalid", errors, message: `${n} field${n === 1 ? " needs" : "s need"} attention before saving.` };
  }
  if (!Object.keys(patches).length) return { kind: "unchanged" };

  const res = applyPatches(file.text, patches);
  try {
    const saved = await putManualFile(cfg, req.edition, res.text, req.sha);
    let prUrl: string | null = null;
    try {
      prUrl = (await findPullRequest(cfg, req.edition))?.url ?? null;
    } catch {
      prUrl = null; // the save worked; the PR link is a convenience
    }
    return { kind: "saved", ...saved, prUrl, changed: Object.keys(patches), inPlace: res.inPlace };
  } catch (e) {
    if (e instanceof ConflictError) return { kind: "conflict", message: e.message };
    throw e;
  }
}
