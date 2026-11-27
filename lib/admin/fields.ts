// The admin form's field model and validation rules (spec 11.2, 15 item 6).
// Shared by the client form (components/admin/AdminForm.tsx) and the save route
// (app/api/admin/save/route.ts), so both check exactly the same rules. No Node imports here.
//
// The file format itself belongs to scripts/lib/manual-template.ts and scripts/lib/io.ts
// (ManualEntry). This module only maps one ManualEntry to form strings and back.

import type { ManualEntry } from "@/scripts/lib/io";

export const EDITION_ID_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** One side of a period: YYYY, YYYY-MM, YYYY-MM-DD, YYYY-Qn or YYYY-Hn (what scripts/lib/io.ts periodEnd reads). */
const PERIOD_PART_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?|-Q[1-4]|-H[12])?$/;

/** A period or as-of value as used in data/manual/*.yaml: one PERIOD_PART, or a range "A/B" like 2026-01/2026-10. */
export function isPeriod(s: string): boolean {
  const parts = s.split("/");
  if (parts.length > 2) return false;
  return parts.every((p) => PERIOD_PART_RE.test(p.trim()));
}

export const PERIOD_HINT = "Like 2026-11, 2026-11-20, 2026-Q3, 2026-H1, 2026 or 2026-01/2026-10";

export type Status = "stale" | "updated" | "carry";

/** Everything the owner can type, as strings (what the inputs hold). */
export interface FieldForm {
  status: Status;
  value: string;
  display: string;
  period: string;
  period_label: string;
  as_of: string;
  year_ago: string;
  year_ago_display: string;
  year_ago_period: string;
  change_pct: string;
  change_points: string;
  source_url: string;
  reason: string;
}

export type FieldKey = keyof FieldForm;
export type TextKey = Exclude<FieldKey, "status">;
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** What the form knows about one entry besides the inputs. Built on the server from the file. */
export interface FieldMeta {
  id: string;
  label: string;
  area: string;
  required: boolean;
  unit: string;
  expected_release: string;
  notes: string;
  footnote: string;
  /** The YAML has a `display` / `year_ago_display` / `change_reported` line, so the form offers it. */
  has_display: boolean;
  has_year_ago_display: boolean;
  has_change_reported: boolean;
  /** The values currently in the file, as strings (placeholders and "last value" hints). */
  current: FieldForm;
}

/** Text form of a YAML scalar. js-yaml turns an unquoted 2026-11-20 into a Date, so handle that too. */
export function asText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function statusOf(e: ManualEntry): Status {
  if (e.stale === false) return "updated";
  if (e.carry_forward === true) return "carry";
  return "stale";
}

/** The file's values as form strings. */
export function formFromEntry(e: ManualEntry): FieldForm {
  return {
    status: statusOf(e),
    value: asText(e.value),
    display: asText(e.display),
    period: asText(e.period),
    period_label: asText(e.period_label),
    as_of: asText(e.as_of),
    year_ago: asText(e.year_ago),
    year_ago_display: asText(e.year_ago_display),
    year_ago_period: asText(e.year_ago_period),
    change_pct: asText(e.change_reported?.pct),
    change_points: asText(e.change_reported?.points),
    source_url: asText(e.source_url),
    reason: asText(e.carry_forward_reason),
  };
}

/** Month's values start blank (the old ones show as placeholders) unless the entry is already updated. */
export const BLANK_WHEN_NOT_UPDATED: TextKey[] = [
  "value", "display", "period", "period_label", "as_of",
  "year_ago", "year_ago_display", "year_ago_period", "change_pct", "change_points",
];

/** The starting state of the inputs for one entry. */
export function initialForm(meta: FieldMeta): FieldForm {
  const f = { ...meta.current };
  if (f.status !== "updated") for (const k of BLANK_WHEN_NOT_UPDATED) f[k] = "";
  return f;
}

// ---------------------------------------------------------------- numbers

type Parsed = { ok: true; value: number | null } | { ok: false };

/** Plain numbers only: "4.1", "-0.3", "416700" or "416,700". Blank is null. */
export function parseNumber(s: string): Parsed {
  const t = s.trim();
  if (t === "") return { ok: true, value: null };
  const plain = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(plain)) return { ok: false };
  const n = Number(plain);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

const NUMBER_MSG = "Type a plain number, like 4.1 or 416700 (no %, $ or words).";

// ---------------------------------------------------------------- validation

const MAX_TEXT = 300;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Rules for one entry. Returns an empty object when it is fine. */
export function validateField(meta: Pick<FieldMeta, "has_display" | "has_year_ago_display" | "has_change_reported">, f: FieldForm): FieldErrors {
  const err: FieldErrors = {};
  const updated = f.status === "updated";

  if (!["stale", "updated", "carry"].includes(f.status)) err.status = "Choose a status.";

  for (const k of Object.keys(f) as FieldKey[]) {
    const v = f[k];
    if (typeof v !== "string") err[k] = "Invalid value.";
    else if (CONTROL_RE.test(v)) err[k] = "Remove line breaks and special characters.";
    else if (v.length > MAX_TEXT) err[k] = `Keep this under ${MAX_TEXT} characters.`;
  }
  if (Object.keys(err).length) return err;

  for (const k of ["value", "year_ago", "change_pct", "change_points"] as const) {
    if (!parseNumber(f[k]).ok) err[k] = NUMBER_MSG;
  }
  for (const k of ["period", "as_of", "year_ago_period"] as const) {
    const v = f[k].trim();
    if (v && !isPeriod(v)) err[k] = `Use the same format as before. ${PERIOD_HINT}.`;
  }
  if (f.period_label.length > 40) err.period_label = "Keep this short, like Nov, Q3 or Jan–Oct.";
  if (f.display.length > 60) err.display = "Keep this under 60 characters.";
  if (f.year_ago_display.length > 60) err.year_ago_display = "Keep this under 60 characters.";
  const url = f.source_url.trim();
  if (url && !/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url)) err.source_url = "Paste the full web address, starting with https://";

  if (updated) {
    const v = parseNumber(f.value);
    if (!err.value && v.ok && v.value == null) err.value = "Enter this month's number.";
    if (!err.period && !f.period.trim()) err.period = `Enter the period this number covers. ${PERIOD_HINT}.`;
    if (!err.as_of && !f.as_of.trim()) err.as_of = "Enter the as-of date or period (often the same as the period).";
    if (!err.period_label && !f.period_label.trim()) err.period_label = "Enter the short label shown on the page, like Nov or Q3.";
    const ya = parseNumber(f.year_ago);
    if (!err.year_ago_period && ya.ok && ya.value != null && !f.year_ago_period.trim()) {
      err.year_ago_period = "Enter the year-ago period (the same period one year earlier).";
    }
  }
  if (f.status === "carry" && !f.reason.trim()) {
    err.reason = "Say briefly why there is no new number, e.g. “Publishes quarterly; next release Dec 4”.";
  }
  if (!meta.has_display && f.display) err.display = "This entry has no display text.";
  if (!meta.has_year_ago_display && f.year_ago_display) err.year_ago_display = "This entry has no year-ago display text.";
  if (!meta.has_change_reported && (f.change_pct || f.change_points)) err.change_pct = "This entry has no reported change.";
  return err;
}

// ---------------------------------------------------------------- form -> YAML changes

/** Keys of a ManualEntry the form can change. `undefined` in a patch means "delete this line". */
export type PatchKey =
  | "stale" | "carry_forward" | "carry_forward_reason" | "value" | "display" | "period" | "period_label"
  | "year_ago" | "year_ago_display" | "year_ago_period" | "change_reported" | "as_of" | "source_url";
export type EntryPatch = Partial<Record<PatchKey, unknown>>;

const sameScalar = (a: unknown, b: unknown) => (a == null && b == null) || (a != null && b != null && asText(a) === asText(b) && typeof a === typeof b);

/**
 * The minimal set of key changes that turns `orig` into what the form says. Fields the owner did not
 * touch produce no change, so untouched entries stay byte-identical in the file.
 *
 * Blank inputs mean "keep the old value" while the status is not "updated", and
 * "empty / no value" once it is (a blank year-ago becomes null; a blank display line is removed so the
 * standard format is used, as the template's instructions say).
 */
export function entryPatch(orig: ManualEntry, meta: Pick<FieldMeta, "has_display" | "has_year_ago_display" | "has_change_reported">, f: FieldForm): EntryPatch {
  const p: EntryPatch = {};
  const updated = f.status === "updated";
  const set = (k: PatchKey, v: unknown) => {
    const o = (orig as Record<string, unknown>)[k];
    if (v === undefined) {
      if (o !== undefined) p[k] = undefined;
    } else if (!sameScalar(o, v)) p[k] = v;
  };
  const keepBlank = (s: string) => !updated && s.trim() === "";

  set("stale", !updated);
  if (f.status === "carry" || orig.carry_forward !== undefined) set("carry_forward", f.status === "carry");
  if (f.status === "carry") set("carry_forward_reason", f.reason.trim());
  else if (orig.carry_forward_reason) set("carry_forward_reason", "");

  const num = (k: "value" | "year_ago", s: string) => {
    if (keepBlank(s)) return;
    const n = parseNumber(s);
    if (n.ok) set(k, n.value);
  };
  num("value", f.value);
  num("year_ago", f.year_ago);

  for (const k of ["period", "period_label", "as_of", "year_ago_period"] as const) {
    if (keepBlank(f[k])) continue;
    if (orig[k] === undefined && !f[k].trim()) continue;
    set(k, f[k].trim());
  }
  for (const k of ["display", "year_ago_display"] as const) {
    if (!(k === "display" ? meta.has_display : meta.has_year_ago_display)) continue;
    if (keepBlank(f[k])) continue;
    set(k, f[k].trim() === "" ? undefined : f[k].trim());
  }
  if (meta.has_change_reported && !(keepBlank(f.change_pct) && keepBlank(f.change_points))) {
    const pct = parseNumber(f.change_pct);
    const pts = parseNumber(f.change_points);
    const c: { pct?: number; points?: number; approx?: boolean } = {};
    if (pct.ok && pct.value != null) c.pct = pct.value;
    if (pts.ok && pts.value != null) c.points = pts.value;
    if (orig.change_reported?.approx && (c.pct != null || c.points != null)) c.approx = true;
    const next = c.pct == null && c.points == null ? undefined : c;
    if (next === undefined) {
      if (orig.change_reported !== undefined) p.change_reported = undefined;
    } else if (JSON.stringify(next) !== JSON.stringify(orig.change_reported ?? null)) {
      p.change_reported = next;
    }
  }
  const url = f.source_url.trim();
  if (url) set("source_url", url);
  return p;
}

// ---------------------------------------------------------------- input helpers (client)

/** What a field's unit means for typing, in plain words. */
export const UNIT_HINT: Record<string, string> = {
  pct: "percent, e.g. 4.1 for 4.1%",
  pts: "points",
  usd: "dollars, e.g. 416700",
  count: "a count, e.g. 203000",
  millions: "millions, e.g. 1.76",
  thousands: "thousands",
  index: "index level",
  months: "months",
  days: "days",
  usd_bn: "billions of dollars",
  ratio: "ratio",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A suggested short label for a period: 2026-11 -> Nov, 2026-Q3 -> Q3, 2026-11-20 -> Nov 20, 2026-01/2026-10 -> Jan–Oct. */
export function suggestLabel(period: string): string {
  const p = period.trim();
  if (!isPeriod(p)) return "";
  const parts = p.split("/").map((s) => s.trim());
  if (parts.length === 2) {
    const a = parts[0].match(/^\d{4}-(\d{2})$/);
    const b = parts[1].match(/^\d{4}-(\d{2})$/);
    return a && b ? `${MONTHS[+a[1] - 1]}–${MONTHS[+b[1] - 1]}` : "";
  }
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\d{4}-(\d{2})-(\d{2})$/))) return `${MONTHS[+m[1] - 1]} ${+m[2]}`;
  if ((m = p.match(/^\d{4}-(\d{2})$/))) return MONTHS[+m[1] - 1];
  if ((m = p.match(/^\d{4}-([QH][1-4])$/))) return m[1];
  return p;
}

/** The same period one year earlier: 2026-11 -> 2025-11, 2026-01/2026-10 -> 2025-01/2025-10. */
export function yearEarlier(period: string): string {
  const p = period.trim();
  if (!isPeriod(p)) return "";
  return p.replace(/(^|\/)(\d{4})/g, (_, sep: string, y: string) => `${sep}${+y - 1}`);
}
