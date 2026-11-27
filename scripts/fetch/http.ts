// Shared HTTP helper for the fetchers: timeout, 2 retries with exponential backoff (spec 12.4),
// JSON and CSV helpers. API keys are redacted from every error message.

export type FetchImpl = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}>;

export interface HttpOptions {
  timeoutMs?: number;
  /** Extra attempts after the first one. Default 2 (spec 12.4). */
  retries?: number;
  /** Delay before retry n is backoffMs * 2^(n-1). */
  backoffMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Hides api_key / apikey / token query values. */
export function redact(text: string): string {
  return text.replace(/((?:api_?key|token)=)[^&\s"']+/gi, "$1REDACTED");
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryable(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}

/** GET a URL as text. Retries network errors, timeouts, 408/429 and 5xx; other 4xx fail at once. */
export async function fetchText(url: string, opts: HttpOptions = {}): Promise<string> {
  const {
    timeoutMs = 30_000,
    retries = 2,
    backoffMs = 1_000,
    headers,
    fetchImpl = globalThis.fetch as unknown as FetchImpl,
    sleep = defaultSleep,
  } = opts;
  let last: HttpError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal, headers });
      const body = await res.text();
      if (res.ok) return body;
      last = new HttpError(redact(`HTTP ${res.status} ${res.statusText} for ${url}`), res.status, body);
    } catch (e) {
      const msg = ctrl.signal.aborted ? `timed out after ${timeoutMs} ms` : (e as Error).message;
      last = new HttpError(redact(`Request failed for ${url}: ${msg}`), null);
    } finally {
      clearTimeout(timer);
    }
    if (!retryable(last.status)) break;
  }
  throw last!;
}

export async function fetchJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<{ data: T; raw: string }> {
  const raw = await fetchText(url, opts);
  try {
    return { data: JSON.parse(raw) as T, raw };
  } catch {
    throw new HttpError(redact(`Invalid JSON from ${url}`), null, raw.slice(0, 500));
  }
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** CSV text to objects keyed by the header row (keys trimmed, lower-cased). */
export function csvToObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
