// Between-edition VIX alert (spec Section 9, 12.3). FRED, Cboe and Buttondown are replaced by a
// local HTTP stand-in; all VIX values below are SYNTHETIC test inputs, not market data.

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { lastAlertLine, lastSentAlert, type AlertLogEntry } from "../lib/alerts";
import { audienceApplied, sendTagOnlyEmail, tagOnlyAudience } from "../lib/buttondown";
import {
  buildAlertEmail,
  decide,
  parseCboeVixCsv,
  runVixAlert,
  todayCentral,
  weekdaysBetween,
  type Close,
} from "../scripts/lib/vix-alert";

const BANNED = ["will", "expect", "forecast", "likely", "poised", "bubble", "crash", "opportunity", "should"];
const noSleep = async () => {};

const entry = (date: string, vix = 31): AlertLogEntry => ({
  date,
  vix,
  level: vix >= 40 ? "extreme" : "high",
  threshold: 30,
  sent_at: `${date}T22:00:00.000Z`,
  mode: "send",
});

// ---- local stand-in for FRED, Cboe and Buttondown -------------------------------------------

interface Recorded {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}
const state = {
  fredObs: [] as { date: string; value: string }[],
  cboeCsv: "DATE,OPEN,HIGH,LOW,CLOSE\n",
  echoFilters: true,
  requests: [] as Recorded[],
};
let server: http.Server;
let base = "";

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = req.url ?? "";
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      state.requests.push({ method: req.method ?? "", url, body });
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.startsWith("/fred")) return json(200, { observations: state.fredObs });
      if (url.startsWith("/cboe")) {
        res.writeHead(200, { "Content-Type": "text/csv" });
        return res.end(state.cboeCsv);
      }
      if (url === "/bd/emails" && req.method === "POST") {
        const { filters, ...rest } = body ?? {};
        return json(201, { id: "em_123", ...rest, ...(state.echoFilters ? { filters } : {}) });
      }
      if (url === "/bd/emails/em_123" && req.method === "PATCH") return json(200, { id: "em_123", ...body });
      json(404, { detail: "not found" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.BUTTONDOWN_API_BASE = `${base}/bd`;
  process.env.BUTTONDOWN_API_KEY = "test-key";
});
after(() => {
  server.close();
  delete process.env.BUTTONDOWN_API_BASE;
  delete process.env.BUTTONDOWN_API_KEY;
});

let root = "";
beforeEach(() => {
  state.fredObs = [];
  state.cboeCsv = "DATE,OPEN,HIGH,LOW,CLOSE\n";
  state.echoFilters = true;
  state.requests = [];
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-vix-"));
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "alerts.json"), "[]\n");
});

const env = (extra: Record<string, string> = {}) => ({
  FRED_API_KEY: "fred-test",
  FRED_API_BASE: `${base}/fred`,
  CBOE_VIX_CSV_URL: `${base}/cboe`,
  SITE_URL: "https://example.test",
  ...extra,
});
const quiet = () => {};
const readLog = () => JSON.parse(fs.readFileSync(path.join(root, "data", "alerts.json"), "utf8")) as AlertLogEntry[];
const emailPosts = () => state.requests.filter((r) => r.url.startsWith("/bd/"));

// ---- pure logic -----------------------------------------------------------------------------

describe("threshold rule", () => {
  const c = (close: number): Close => ({ date: "2026-11-25", close });
  it("alerts at or above the threshold, not below", () => {
    assert.equal(decide(c(29.99), []).action, "below");
    assert.equal(decide(c(30), []).action, "alert");
    assert.equal(decide(c(45.1), []).action, "alert");
  });
  it("honours a custom threshold", () => {
    assert.equal(decide(c(26), [], 25).action, "alert");
    assert.equal(decide(c(34), [], 35).action, "below");
  });
  it("does not alert twice for the same close", () => {
    assert.equal(decide(c(33), [entry("2026-11-25")]).action, "duplicate");
  });
});

describe("cooldown (5 trading days, weekdays only)", () => {
  it("counts weekdays in (from, to]", () => {
    assert.equal(weekdaysBetween("2026-11-20", "2026-11-23"), 1); // Fri -> Mon
    assert.equal(weekdaysBetween("2026-11-20", "2026-11-27"), 5); // Fri -> next Fri
    assert.equal(weekdaysBetween("2026-11-21", "2026-11-22"), 0); // Sat -> Sun
    assert.equal(weekdaysBetween("2026-11-25", "2026-11-25"), 0);
  });
  it("blocks within 5 trading days across a weekend and allows on the 5th", () => {
    const log = [entry("2026-11-19")]; // Thursday
    assert.equal(decide({ date: "2026-11-24", close: 32 }, log).action, "cooldown"); // Tue: 3 weekdays
    assert.equal(decide({ date: "2026-11-25", close: 32 }, log).action, "cooldown"); // Wed: 4
    assert.equal(decide({ date: "2026-11-26", close: 32 }, log).action, "alert"); // Thu: 5 (Thanksgiving is not excluded)
  });
  it("ignores log entries that were not sends", () => {
    const log = [{ ...entry("2026-11-24"), mode: "dry-run" } as unknown as AlertLogEntry];
    assert.equal(decide({ date: "2026-11-25", close: 32 }, log).action, "alert");
    assert.equal(lastSentAlert(log), null);
  });
});

describe("Cboe CSV parsing", () => {
  it("parses MM/DD/YYYY rows, sorts by date and skips blank closes", () => {
    const csv = "﻿DATE,OPEN,HIGH,LOW,CLOSE\r\n11/24/2026,20.1,22.0,19.8,21.5\r\n11/20/2026,18,19,17,18.25\r\n11/25/2026,21,23,20,\r\n";
    assert.deepEqual(parseCboeVixCsv(csv), [
      { date: "2026-11-20", close: 18.25 },
      { date: "2026-11-24", close: 21.5 },
    ]);
  });
  it("accepts ISO dates and ignores junk", () => {
    assert.deepEqual(parseCboeVixCsv("Date,Close\n2026-11-25,31.2\nnot a date,1\n"), [{ date: "2026-11-25", close: 31.2 }]);
    assert.deepEqual(parseCboeVixCsv(""), []);
  });
});

describe("alert email text", () => {
  const mk = (close: number) =>
    buildAlertEmail({ close: { date: "2026-11-25", close }, threshold: 30, siteUrl: "https://example.test/", source: "FRED VIXCLS" });
  it("uses the spec sentence, level wording, thresholds, gauges link and unsubscribe tag", () => {
    const { subject, body } = mk(33.104);
    assert.ok(body.startsWith("Market volatility alert: the VIX closed at 33.10 on Nov 25, 2026, above 30. This is an automated data notice, not advice."));
    assert.match(body, /VIX HIGH ALERT · 33\.10 \(Nov 25\), above 30/);
    assert.match(body, /Thresholds: 20 elevated · 30 high · 40 extreme\./);
    assert.match(body, /https:\/\/example\.test\/#gauges/);
    assert.match(body, /\{\{ unsubscribe_url \}\}/);
    assert.match(subject, /33\.10/);
    assert.match(mk(41).body, /VIX EXTREME · 41\.00/);
  });
  it("contains none of the banned forecasting words", () => {
    for (const v of [30, 33.1, 41]) {
      const { subject, body } = mk(v);
      for (const w of BANNED) assert.doesNotMatch(`${subject}\n${body}`, new RegExp(`\\b${w}\\b`, "i"), `"${w}" at ${v}`);
    }
  });
});

describe("Buttondown tag-only audience", () => {
  it("builds the filter and recognises it", () => {
    const a = tagOnlyAudience("alerts");
    assert.ok(audienceApplied({ filters: a }, "alerts"));
    assert.ok(!audienceApplied({ filters: a }, "other"));
    assert.ok(!audienceApplied({ filters: { ...a, predicate: "or" } }, "alerts"));
    assert.ok(!audienceApplied({}, "alerts"));
    assert.throws(() => tagOnlyAudience("  "));
  });
  it("refuses an empty tag without calling Buttondown", async () => {
    const r = await sendTagOnlyEmail({ subject: "s", body: "b", tag: "", send: true });
    assert.equal(r.kind, "refused");
    assert.equal(emailPosts().length, 0);
  });
  it("refuses to send when Buttondown does not confirm the tag filter", async () => {
    state.echoFilters = false;
    const r = await sendTagOnlyEmail({ subject: "s", body: "b", tag: "alerts", send: true });
    assert.equal(r.kind, "refused");
    const posts = emailPosts();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body?.status, "draft"); // created as draft, never sent
    assert.ok(!posts.some((p) => p.method === "PATCH"));
  });
});

// ---- end to end through runVixAlert ---------------------------------------------------------

describe("runVixAlert", () => {
  it("check mode prints the decision and never calls Buttondown", async () => {
    state.fredObs = [{ date: "2026-11-25", value: "35.00" }];
    const r = await runVixAlert({ mode: "check", date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(r.decision?.action, "alert");
    assert.equal(emailPosts().length, 0);
  });

  it("dry-run creates a DRAFT for the alerts tag and logs nothing", async () => {
    state.fredObs = [{ date: "2026-11-25", value: "35.00" }];
    const r = await runVixAlert({ mode: "dry-run", date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(r.buttondown?.kind, "draft");
    const posts = emailPosts();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].method, "POST");
    assert.equal(posts[0].body?.status, "draft");
    assert.deepEqual(posts[0].body?.filters, tagOnlyAudience("alerts"));
    assert.deepEqual(readLog(), []);
  });

  it("send emails the alerts tag, then logs the alert", async () => {
    state.fredObs = [
      { date: "2026-11-24", value: "28.00" },
      { date: "2026-11-25", value: "41.50" },
    ];
    const now = () => new Date("2026-11-25T22:31:00Z");
    const r = await runVixAlert({ mode: "send", date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, now, log: quiet });
    assert.equal(r.buttondown?.kind, "sent");
    const posts = emailPosts();
    assert.equal(posts.length, 2);
    assert.equal(posts[1].method, "PATCH");
    assert.equal(posts[1].body?.status, "about_to_send");
    assert.deepEqual(readLog(), [
      { date: "2026-11-25", vix: 41.5, level: "extreme", threshold: 30, sent_at: "2026-11-25T22:31:00.000Z", mode: "send" },
    ]);
    // A second run the next day is in cooldown.
    state.requests = [];
    state.fredObs.push({ date: "2026-11-26", value: "42.00" });
    const again = await runVixAlert({ mode: "send", date: "2026-11-26", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(again.decision?.action, "cooldown");
    assert.equal(emailPosts().length, 0);
    assert.equal(lastAlertLine(root), "Last alert: Nov 25, 2026 (VIX 41.50)");
  });

  it("send refuses (and logs nothing) when the tag restriction is not applied", async () => {
    state.fredObs = [{ date: "2026-11-25", value: "35.00" }];
    state.echoFilters = false;
    const r = await runVixAlert({ mode: "send", date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(r.failed, true);
    assert.equal(r.buttondown?.kind, "refused");
    assert.ok(!emailPosts().some((p) => p.method === "PATCH"));
    assert.deepEqual(readLog(), []);
  });

  it("falls back to the Cboe CSV when FRED has not posted the day's close", async () => {
    state.fredObs = [{ date: "2026-11-24", value: "22.00" }, { date: "2026-11-25", value: "." }];
    state.cboeCsv = "DATE,OPEN,HIGH,LOW,CLOSE\n11/24/2026,21,23,20,22.00\n11/25/2026,25,33,24,31.20\n";
    const r = await runVixAlert({ mode: "check", date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(r.decision?.action, "alert");
    assert.equal(r.decision?.close.close, 31.2);
  });

  it("below the threshold does nothing; dry-run --force makes a TEST draft", async () => {
    state.fredObs = [{ date: "2026-11-25", value: "18.40" }];
    const r = await runVixAlert({ mode: "dry-run", date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(r.decision?.action, "below");
    assert.equal(emailPosts().length, 0);
    const f = await runVixAlert({ mode: "dry-run", force: true, date: "2026-11-25", threshold: 30, root, env: env(), http: { sleep: noSleep }, log: quiet });
    assert.equal(f.buttondown?.kind, "draft");
    assert.match(String(emailPosts()[0].body?.subject), /^\[TEST\]/);
    assert.match(String(emailPosts()[0].body?.body), /closed at 18\.40 on Nov 25, 2026, below 30/);
    await assert.rejects(
      runVixAlert({ mode: "send", force: true, date: "2026-11-25", threshold: 30, root, env: env(), log: quiet }),
      /only allowed with --dry-run/,
    );
  });

  it("treats an old close as stale", async () => {
    state.fredObs = [{ date: "2026-11-16", value: "35.00" }];
    const r = await runVixAlert({ mode: "send", date: "2026-11-25", threshold: 30, root, env: env(), cboe: false, http: { sleep: noSleep }, log: quiet });
    assert.equal(r.decision, null);
    assert.equal(emailPosts().length, 0);
  });

  it("todayCentral uses America/Chicago", () => {
    assert.equal(todayCentral(new Date("2026-11-26T03:00:00Z")), "2026-11-25");
  });
});
