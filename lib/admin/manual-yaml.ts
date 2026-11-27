// Reads and edits data/manual/YYYY-MM.yaml for the admin form, keeping the file's comments.
//
// The format is the one scripts/lib/manual-template.ts writes and scripts/lib/io.ts reads
// (ManualFile / ManualEntry): a header comment, `edition:`, and `metrics:` with one block per metric
// at two-space indent and one `key: scalar   # optional comment` line per field at four spaces.
//
// Edits are applied line by line in place, so the header, the per-entry comments and every untouched
// line stay exactly as they were. The result is parsed again and compared with the intended data; if
// the file has a layout this editor does not handle (e.g. someone rewrote it with block scalars), it
// falls back to re-serializing with js-yaml. The fallback keeps the header comment at the top but
// drops the comments inside the entries (js-yaml cannot round-trip comments); `inPlace` says which
// happened.

import { dump, load } from "js-yaml";
import type { ManualEntry, ManualFile } from "@/scripts/lib/io";
import type { EntryPatch } from "./fields";

export class ManualFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualFileError";
  }
}

/** Parses the file the same way scripts/lib/io.ts loadManualAt does, and checks its shape. */
export function parseManual(text: string): ManualFile {
  let y: unknown;
  try {
    y = load(text);
  } catch (e) {
    throw new ManualFileError(`The manual file is not valid YAML: ${(e as Error).message.split("\n")[0]}`);
  }
  const m = (y ?? {}) as ManualFile;
  if (typeof m !== "object" || Array.isArray(m)) throw new ManualFileError("The manual file is not a YAML mapping.");
  const metrics = m.metrics ?? {};
  if (typeof metrics !== "object" || Array.isArray(metrics)) throw new ManualFileError("`metrics:` is not a mapping.");
  for (const [id, e] of Object.entries(metrics)) {
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new ManualFileError(`metrics.${id} is not a mapping.`);
  }
  return { ...m, metrics };
}

/** Field order the template writes; new keys are inserted at the matching place. */
const ORDER = [
  "label", "required", "stale", "value", "display", "period", "period_label", "year_ago", "year_ago_display",
  "year_ago_period", "change_reported", "as_of", "source_url", "source_name", "notes", "footnote",
  "expected_release", "carry_forward", "carry_forward_reason",
];

/** YAML text for one value, in the template's style (strings as JSON strings, which YAML reads as-is). */
export function scalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ManualFileError(`Cannot write the number ${v}.`);
    return String(v);
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object" && !Array.isArray(v)) {
    const parts = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${scalar(x)}`);
    return `{ ${parts.join(", ")} }`;
  }
  throw new ManualFileError(`Cannot write ${typeof v} values.`);
}

/** Splits the text after "key:" into [value, trailing whitespace + comment], or null if it isn't one simple line. */
function splitValue(rest: string): [string, string] | null {
  const lead = rest.match(/^\s*/)![0];
  const s = rest.slice(lead.length);
  let end = -1;
  if (s.startsWith('"')) {
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "\\") i++;
      else if (s[i] === '"') {
        end = i + 1;
        break;
      }
    }
  } else if (s.startsWith("'")) {
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "'" && s[i + 1] === "'") i++;
      else if (s[i] === "'") {
        end = i + 1;
        break;
      }
    }
  } else if (s.startsWith("{")) {
    const close = s.indexOf("}");
    if (close >= 0 && !/[{["']/.test(s.slice(1, close))) end = close + 1;
  } else if (s === "" || /^[|>[&*!]/.test(s)) {
    return null; // nested block, block scalar, flow sequence, anchor/alias or tag
  } else {
    const c = s.search(/\s#/);
    end = (c >= 0 ? s.slice(0, c) : s).trimEnd().length;
  }
  if (end < 0) return null;
  const trailing = s.slice(end);
  if (trailing.trim() && !trailing.trim().startsWith("#")) return null;
  return [s.slice(0, end), trailing.trimEnd() === "" ? "" : trailing];
}

interface Block {
  start: number; // the "  id:" line
  end: number; // exclusive
}

const METRIC_RE = /^ {2}([A-Za-z0-9_.-]+):\s*(#.*)?$/;
const indentOf = (l: string) => l.match(/^ */)![0].length;

function findBlock(lines: string[], id: string): Block | null {
  const top = lines.findIndex((l) => /^metrics:\s*(#.*)?$/.test(l));
  if (top < 0) return null;
  let start = -1;
  for (let i = top + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l) && !l.startsWith("#")) return start < 0 ? null : { start, end: i };
    const m = METRIC_RE.exec(l);
    if (m) {
      if (start >= 0) return { start, end: i };
      if (m[1] === id) start = i;
    }
  }
  return start < 0 ? null : { start, end: lines.length };
}

function fieldLine(lines: string[], b: Block, key: string): number {
  for (let i = b.start + 1; i < b.end; i++) {
    if (lines[i].startsWith(`    ${key}:`) && /^ {4}[A-Za-z0-9_]+:(\s|$)/.test(lines[i]) && lines[i].slice(4).split(":")[0] === key) return i;
  }
  return -1;
}

/** True when the line after `i` continues the field (more deeply indented), which this editor won't touch. */
const continues = (lines: string[], i: number, b: Block) =>
  i + 1 < b.end && lines[i + 1].trim() !== "" && !lines[i + 1].trim().startsWith("#") && indentOf(lines[i + 1]) > 4;

/** Applies one patch in place; returns false when the layout is not one it can edit safely. */
function patchBlock(lines: string[], id: string, patch: EntryPatch): boolean {
  for (const [key, v] of Object.entries(patch)) {
    const b = findBlock(lines, id);
    if (!b) return false;
    const i = fieldLine(lines, b, key);
    if (i >= 0) {
      if (continues(lines, i, b)) return false;
      const split = splitValue(lines[i].slice(4 + key.length + 1));
      if (!split) return false;
      if (v === undefined) lines.splice(i, 1);
      else lines[i] = `    ${key}: ${scalar(v)}${split[1]}`;
      continue;
    }
    if (v === undefined) continue;
    // Insert after the last existing key that comes earlier in the template's order.
    const rank = ORDER.indexOf(key);
    let at = b.start + 1;
    for (let j = b.start + 1; j < b.end; j++) {
      const m = lines[j].match(/^ {4}([A-Za-z0-9_]+):/);
      if (!m) continue;
      const r = ORDER.indexOf(m[1]);
      if (r >= 0 && r < rank) {
        at = j + 1;
        while (at < b.end && indentOf(lines[at]) > 4 && lines[at].trim() !== "") at++;
      }
    }
    lines.splice(at, 0, `    ${key}: ${scalar(v)}`);
  }
  return true;
}

/** Key-order-independent JSON, for comparing parsed files. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "undefined";
}

function applyToData(file: ManualFile, patches: Record<string, EntryPatch>): ManualFile {
  const out = JSON.parse(JSON.stringify(file)) as ManualFile;
  for (const [id, patch] of Object.entries(patches)) {
    const e = (out.metrics[id] ?? (out.metrics[id] = {})) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  }
  return out;
}

/** The leading comment block of the file (the template's instructions). */
export function headerComment(text: string): string {
  const out: string[] = [];
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith("#") || (l.trim() === "" && out.length)) out.push(l);
    else break;
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.length ? out.join("\n") + "\n\n" : "";
}

export interface ApplyResult {
  text: string;
  /** true: edited line by line, every comment kept. false: re-serialized; only the header comment kept. */
  inPlace: boolean;
  data: ManualFile;
}

/** Applies the patches to the file text. Throws ManualFileError if the file can't be read. */
export function applyPatches(text: string, patches: Record<string, EntryPatch>): ApplyResult {
  const before = parseManual(text);
  const want = applyToData(before, patches);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);

  let ok = true;
  for (const [id, patch] of Object.entries(patches)) {
    if (!Object.keys(patch).length) continue;
    if (!patchBlock(lines, id, patch)) {
      ok = false;
      break;
    }
  }
  if (ok) {
    const edited = lines.join(eol);
    try {
      const got = parseManual(edited);
      if (canonical(got) === canonical(want)) return { text: edited, inPlace: true, data: got };
    } catch {
      // fall through to the re-serialized version
    }
  }
  const body = dump(want as unknown as Record<string, unknown>, { lineWidth: -1, noRefs: true });
  const fallback = headerComment(text) + body;
  const check = parseManual(fallback);
  if (canonical(check) !== canonical(want)) throw new ManualFileError("Could not write the manual file safely.");
  return { text: fallback, inPlace: false, data: check };
}

export type { ManualEntry, ManualFile };
