import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvToObjects, fetchJson, fetchText, parseCsv, redact, type FetchImpl } from "../../scripts/fetch/http";

const res = (status: number, body = "") => ({ ok: status < 300, status, statusText: String(status), text: async () => body });

function scripted(steps: (number | Error)[]): { fetchImpl: FetchImpl; calls: () => number } {
  let n = 0;
  return {
    fetchImpl: async () => {
      const s = steps[Math.min(n++, steps.length - 1)];
      if (s instanceof Error) throw s;
      return res(s, s === 200 ? '{"ok":true}' : "err");
    },
    calls: () => n,
  };
}

describe("fetchText retries", () => {
  it("retries twice with exponential backoff, then succeeds", async () => {
    const waits: number[] = [];
    const f = scripted([503, new Error("socket hang up"), 200]);
    const body = await fetchText("https://x.test/a", { fetchImpl: f.fetchImpl, backoffMs: 100, sleep: async (ms) => void waits.push(ms) });
    assert.equal(body, '{"ok":true}');
    assert.equal(f.calls(), 3);
    assert.deepEqual(waits, [100, 200]);
  });

  it("gives up after 1 + 2 attempts", async () => {
    const f = scripted([500]);
    await assert.rejects(fetchText("https://x.test/a", { fetchImpl: f.fetchImpl, sleep: async () => {} }), /HTTP 500/);
    assert.equal(f.calls(), 3);
  });

  it("does not retry a 400", async () => {
    const f = scripted([400]);
    await assert.rejects(fetchText("https://x.test/a", { fetchImpl: f.fetchImpl, sleep: async () => {} }), /HTTP 400/);
    assert.equal(f.calls(), 1);
  });

  it("times out", async () => {
    const hang: FetchImpl = (_url, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    await assert.rejects(fetchText("https://x.test/a", { fetchImpl: hang, timeoutMs: 20, retries: 0 }), /timed out after 20 ms/);
  });

  it("never puts the API key in an error message", async () => {
    const f = scripted([500]);
    await assert.rejects(
      fetchText("https://api.test/obs?series_id=X&api_key=SECRET123&file_type=json", { fetchImpl: f.fetchImpl, sleep: async () => {} }),
      (e: Error) => !e.message.includes("SECRET123") && e.message.includes("api_key=REDACTED"),
    );
    assert.equal(redact("apikey=abc&token=xyz"), "apikey=REDACTED&token=REDACTED");
  });

  it("fetchJson rejects invalid JSON", async () => {
    const bad: FetchImpl = async () => res(200, "<html>");
    await assert.rejects(fetchJson("https://x.test/a", { fetchImpl: bad }), /Invalid JSON/);
  });
});

describe("CSV", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    assert.deepEqual(rows, [
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("maps rows to lower-cased header keys", () => {
    assert.deepEqual(csvToObjects("Name,Value\nA,1\n"), [{ name: "A", value: "1" }]);
  });
});
