// Admin form: session cookie, password check, configuration gate, origin check, rate limit.

import assert from "node:assert/strict";
import { test } from "node:test";
import { adminConfig } from "../lib/admin/config";
import { sameOrigin } from "../lib/admin/guard";
import { createRateLimiter } from "../lib/admin/rate-limit";
import { SESSION_TTL_SECONDS, checkPassword, sessionCookieOptions, signSession, verifySession } from "../lib/admin/session";

const keys = { sessionSecret: "s".repeat(40), password: "correct horse battery staple" };
const T0 = Date.UTC(2026, 11, 1, 12, 0, 0);

test("session: a fresh token verifies", () => {
  const t = signSession(keys, T0);
  assert.equal(verifySession(keys, t, T0), true);
  assert.equal(verifySession(keys, t, T0 + 1000), true);
});

test("session: expires after 12 hours", () => {
  const t = signSession(keys, T0);
  assert.equal(SESSION_TTL_SECONDS, 12 * 3600);
  assert.equal(verifySession(keys, t, T0 + (12 * 3600 - 1) * 1000), true);
  assert.equal(verifySession(keys, t, T0 + 12 * 3600 * 1000), false);
  assert.equal(verifySession(keys, t, T0 + 48 * 3600 * 1000), false);
});

test("session: rejects tampering, other secrets and a changed password", () => {
  const t = signSession(keys, T0);
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ v: 1, iat: T0 / 1000, exp: T0 / 1000 + 10 * 365 * 86400 })).toString("base64url");
  assert.equal(verifySession(keys, `${forged}.${sig}`, T0), false, "payload swapped");
  assert.equal(verifySession(keys, `${payload}.${sig.slice(0, -2)}AA`, T0), false, "signature altered");
  assert.equal(verifySession({ ...keys, sessionSecret: "x".repeat(40) }, t, T0), false, "other secret");
  assert.equal(verifySession({ ...keys, password: "new password" }, t, T0), false, "password rotated logs out");
  for (const bad of [undefined, null, "", "abc", "a.b.c", `${payload}.`, `.${sig}`, "x".repeat(600)]) {
    assert.equal(verifySession(keys, bad as string, T0), false, String(bad));
  }
});

test("session: rejects a token issued in the future", () => {
  const t = signSession(keys, T0 + 3600 * 1000);
  assert.equal(verifySession(keys, t, T0), false);
});

test("session: cookie is httpOnly, Secure, SameSite=Strict, 12h", () => {
  assert.deepEqual(sessionCookieOptions(), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 43200 });
  assert.equal(sessionCookieOptions(0).maxAge, 0);
});

test("password: constant-time check accepts only the exact password", () => {
  assert.equal(checkPassword(keys.password, keys.password), true);
  assert.equal(checkPassword(keys.password, keys.password + " "), false);
  assert.equal(checkPassword(keys.password, "correct horse"), false);
  assert.equal(checkPassword(keys.password, ""), false);
  assert.equal(checkPassword(keys.password, null), false);
  assert.equal(checkPassword(keys.password, 123), false);
  assert.equal(checkPassword("", ""), false, "no password configured never matches");
});

const ENV = {
  ADMIN_PASSWORD: "pw",
  ADMIN_SESSION_SECRET: "k".repeat(32),
  GITHUB_TOKEN: "github_pat_x",
  GITHUB_REPOSITORY: "owner/repo",
};

test("config: every variable is required; otherwise the admin form does not exist", () => {
  const ok = adminConfig(ENV);
  assert.ok(ok);
  assert.equal(ok.github.apiBase, "https://api.github.com");
  assert.equal(ok.github.repo, "owner/repo");
  for (const k of Object.keys(ENV)) {
    assert.equal(adminConfig({ ...ENV, [k]: undefined }), null, `${k} missing`);
    assert.equal(adminConfig({ ...ENV, [k]: "" }), null, `${k} empty`);
  }
  assert.equal(adminConfig({ ...ENV, ADMIN_SESSION_SECRET: "short" }), null, "secret under 32 chars");
  assert.equal(adminConfig({ ...ENV, GITHUB_REPOSITORY: "not a repo" }), null);
  assert.equal(adminConfig({ ...ENV, GITHUB_API_BASE: "http://127.0.0.1:9999/" })?.github.apiBase, "http://127.0.0.1:9999");
  assert.equal(adminConfig({ ...ENV, GITHUB_API_BASE: "file:///etc" }), null);
});

test("origin: state-changing requests must come from the same host", () => {
  assert.equal(sameOrigin("https://example.com", "example.com"), true);
  assert.equal(sameOrigin("http://localhost:3000", "localhost:3000"), true);
  assert.equal(sameOrigin("https://evil.com", "example.com"), false);
  assert.equal(sameOrigin(null, "example.com"), false);
  assert.equal(sameOrigin("null", "example.com"), false);
});

test("rate limit: blocks after the limit within the window, then recovers", () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(rl.blocked("ip", 0), false);
  assert.equal(rl.hit("ip", 0), false);
  rl.hit("ip", 1);
  rl.hit("ip", 2);
  assert.equal(rl.blocked("ip", 3), true);
  assert.equal(rl.hit("ip", 3), true);
  assert.equal(rl.blocked("other", 3), false);
  assert.equal(rl.blocked("ip", 2000), false);
  rl.hit("ip", 2000);
  rl.reset("ip");
  assert.equal(rl.blocked("ip", 2001), false);
});
