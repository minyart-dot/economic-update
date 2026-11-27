// NY Fed Household Debt and Credit Report (SEMI, spec 11.1): share of household debt in some stage
// of delinquency, latest quarter and the same quarter a year earlier.
//
// Source: the report's data workbook (xlsx), published about five weeks after each quarter ends.
// Its file name changes every quarter. Set NYFED_HHDC_URL to the current link; otherwise the URL is
// derived from the edition's latest completed quarter (the last quarter that ended before the
// edition month began) with the pattern the NY Fed has used:
//   https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/xls/HHD_C_Report_<YYYY>Q<n>.xlsx
// (not confirmed live: the site could not be reached from the build environment).
//
// Parsing never uses fixed cell addresses. Every sheet is scanned for a header row that either
//   (a) names the series directly ("... in some stage of delinquency", "Total delinquent"), or
//   (b) is the "delinquency status" table: 30, 60, 90, 120+ days late and Severely Derogatory
//       (plus, usually, Current). Delinquent = sum of the five delinquent columns. With a Current
//       column the row must add up to 100% (or 1.0), which also tells percent from fraction units;
//       without one the sheet's title must say "percent".
// Rows below the header are read while the first cell is a quarter label ("26:Q3", "2026Q3",
// "Q3 2026"). All matching tables must agree. Then strict checks: the latest quarter must be the
// expected one and values must be 0–20%. Any doubt throws, so run.ts keeps the last published value
// marked stale and the metric stays in the manual template.
//
// Note: "Percent of Balance 90+ Days Delinquent" (by loan type) is a different, smaller measure
// and is deliberately not matched.

import ExcelJS from "exceljs";
import { HttpError, redact, type FetchImpl, type HttpOptions } from "./http";
import type { Computed, SaveRaw } from "./types";

export const NYFED_MIN = 0;
export const NYFED_MAX = 20;

/** Latest quarter that ended before the edition month began: 2026-11 -> "2026-Q3", 2027-01 -> "2026-Q4". */
export function expectedQuarter(edition: string): string {
  const [y, m] = edition.split("-").map(Number);
  const q = Math.floor((m - 1) / 3); // quarters fully before this month: 0..3
  return q === 0 ? `${y - 1}-Q4` : `${y}-Q${q}`;
}

export function defaultNyfedUrl(edition: string): string {
  const [y, q] = expectedQuarter(edition).split("-");
  return `https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/xls/HHD_C_Report_${y}${q}.xlsx`;
}

/** The quarter's report PDF (same naming as the source_url in metrics.yaml). */
export function nyfedReportUrl(quarter: string): string {
  const [y, q] = quarter.split("-");
  return `https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/hhdc_${y}${q.toLowerCase()}.pdf`;
}

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

/** "26:Q3", "2026:Q3", "2026Q3", "2026 Q3", "2026-Q3", "Q3 2026", "Q3-2026" -> "2026-Q3". */
export function parseQuarterLabel(cell: Cell): string | null {
  if (typeof cell !== "string") return null;
  const s = cell.trim();
  let m = /^(\d{2}|\d{4})\s*[:\-\s]?\s*Q([1-4])$/i.exec(s);
  if (m) return `${m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1])}-Q${m[2]}`;
  m = /^Q([1-4])\s*[:\-\s]?\s*(\d{4})$/i.exec(s);
  if (m) return `${m[2]}-Q${m[1]}`;
  return null;
}

const EXPLICIT = /in some stage of delinquency|^total\s+delinquen|^(?:any|all)\s+delinquen/i;
const STATUS: Record<string, RegExp> = {
  d30: /^30\s*(?:\+\s*)?days?\s+(?:late|delinquent|past due)/i,
  d60: /^60\s*days?\s+(?:late|delinquent|past due)/i,
  d90: /^90\s*days?\s+(?:late|delinquent|past due)/i,
  d120: /^120\s*\+?\s*days?\s+(?:late|delinquent|past due)/i,
  sd: /^severely\s+derogatory/i,
};
const CURRENT = /^current$/i;

const text = (c: Cell) => (typeof c === "string" ? c.trim() : "");
const num = (c: Cell): number | null => {
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (typeof c === "string" && /^-?\d+(?:\.\d+)?$/.test(c.trim())) return Number(c.trim());
  return null;
};
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

interface Candidate {
  where: string;
  series: Map<string, number>;
}

function tablesIn(sheet: Sheet): Candidate[] {
  const out: Candidate[] = [];
  sheet.rows.forEach((row, h) => {
    const cols = row.map(text);
    const explicit = cols.findIndex((c) => EXPLICIT.test(c));
    const status = Object.fromEntries(Object.entries(STATUS).map(([k, re]) => [k, cols.findIndex((c) => re.test(c))]));
    const current = cols.findIndex((c) => CURRENT.test(c));
    const allStatus = Object.values(status).every((i) => i >= 0);
    if (explicit < 0 && !allStatus) return;
    const title = [sheet.name, ...sheet.rows.slice(Math.max(0, h - 6), h).flat().map(text)].join(" ");
    if (explicit < 0 && current < 0 && !/percent/i.test(title)) return;

    const series = new Map<string, number>();
    let scale: number | null = explicit >= 0 ? 1 : null;
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const cells = sheet.rows[r];
      const first = cells.find((c) => c !== null && text(c) !== "");
      const quarter = parseQuarterLabel(first ?? null);
      if (!quarter) {
        if (series.size) break; // end of the table
        continue;
      }
      let value: number | null;
      if (explicit >= 0) value = num(cells[explicit]);
      else {
        const parts = Object.values(status).map((i) => num(cells[i]));
        if (parts.some((p) => p === null)) continue;
        value = (parts as number[]).reduce((a, b) => a + b, 0);
        if (current >= 0) {
          const cur = num(cells[current]);
          if (cur === null) continue;
          const total = cur + value;
          const rowScale = Math.abs(total - 100) <= 0.5 ? 1 : Math.abs(total - 1) <= 0.005 ? 100 : null;
          if (rowScale === null || (scale !== null && rowScale !== scale)) return; // not a percent-of-balance table
          scale = rowScale;
        } else scale ??= value < 1 ? 100 : 1;
        value *= scale!;
      }
      if (value !== null) series.set(quarter, round(value));
    }
    if (series.size) out.push({ where: `sheet "${sheet.name}" row ${h + 1}`, series });
  });
  return out;
}

const latest = (s: Map<string, number>) => [...s.keys()].sort().at(-1)!;
const yearEarlier = (q: string) => `${Number(q.slice(0, 4)) - 1}${q.slice(4)}`;

/** Pure parser over the workbook's sheets. Throws on anything ambiguous or implausible. */
export function parseHhdc(sheets: Sheet[], expected: string): Computed {
  const cands = sheets.flatMap(tablesIn);
  if (!cands.length) throw new Error("NY Fed workbook: no 'delinquency status' / 'some stage of delinquency' table found (layout may have changed)");
  const first = cands[0];
  const q = latest(first.series);
  const v = first.series.get(q)!;
  for (const c of cands.slice(1)) {
    const cq = latest(c.series);
    if (cq !== q || Math.abs(c.series.get(cq)! - v) > 0.005) {
      throw new Error(`NY Fed workbook: tables disagree (${first.where}: ${q} ${v}; ${c.where}: ${cq} ${c.series.get(cq)})`);
    }
  }
  if (q !== expected) throw new Error(`NY Fed workbook: latest quarter is ${q}, expected ${expected}`);
  const check = (x: number, label: string) => {
    if (!(x >= NYFED_MIN && x <= NYFED_MAX)) {
      throw new Error(`NY Fed workbook: ${label} ${x}% is outside the plausible range ${NYFED_MIN}–${NYFED_MAX}%`);
    }
  };
  check(v, `${q} delinquency share`);
  const yq = yearEarlier(q);
  const ya = first.series.get(yq) ?? null;
  if (ya !== null) check(ya, `${yq} delinquency share`);
  return {
    value: round(v, 2),
    period: q,
    period_label: q.slice(5),
    year_ago: ya === null ? null : round(ya, 2),
    year_ago_period: ya === null ? null : yq,
    as_of: q,
  };
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean" || v instanceof Date) return String(v);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return cellValue((v.result ?? null) as ExcelJS.CellValue);
  if ("text" in v) return String(v.text);
  return null;
}

/** Reads every worksheet of an xlsx file into plain rows (row/column order kept, gaps as null). */
export async function readWorkbook(data: Buffer | ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs types want a Node Buffer
  await wb.xlsx.load((Buffer.isBuffer(data) ? data : Buffer.from(data)) as unknown as ExcelJS.Buffer);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cells[c - 1] = cellValue(cell.value);
      });
      rows[r - 1] = Array.from(cells, (c) => c ?? null);
    });
    return { name: ws.name, rows: Array.from(rows, (r) => r ?? []) };
  });
}

type BinaryResponse = Awaited<ReturnType<FetchImpl>> & { arrayBuffer?: () => Promise<ArrayBuffer> };

/** GET a binary file with the same timeout/retry rules as fetchText (spec 12.4). */
export async function fetchBinary(url: string, opts: HttpOptions = {}): Promise<Buffer> {
  const {
    timeoutMs = 30_000,
    retries = 2,
    backoffMs = 1_000,
    headers,
    fetchImpl = globalThis.fetch as unknown as FetchImpl,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  } = opts;
  let last: HttpError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = (await fetchImpl(url, { signal: ctrl.signal, headers })) as BinaryResponse;
      if (res.ok) {
        if (!res.arrayBuffer) throw new HttpError(`No binary body for ${url}`, null);
        return Buffer.from(await res.arrayBuffer());
      }
      last = new HttpError(redact(`HTTP ${res.status} ${res.statusText} for ${url}`), res.status);
    } catch (e) {
      const msg = ctrl.signal.aborted ? `timed out after ${timeoutMs} ms` : (e as Error).message;
      last = new HttpError(redact(`Request failed for ${url}: ${msg}`), null);
    } finally {
      clearTimeout(timer);
    }
    const s = last.status;
    if (!(s === null || s === 408 || s === 429 || s >= 500)) break;
  }
  throw last!;
}

export async function fetchNyfed(url: string, edition: string, http?: HttpOptions, saveRaw?: SaveRaw): Promise<Computed> {
  const buf = await fetchBinary(url, http);
  const name = decodeURIComponent(url.split("/").pop() || "hhdc.xlsx").replace(/[^\w.-]/g, "_");
  saveRaw?.(`nyfed/${name}.base64`, buf.toString("base64"));
  return parseHhdc(await readWorkbook(buf), expectedQuarter(edition));
}
