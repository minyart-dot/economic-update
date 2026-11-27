// Owner session for /admin. SECURITY:
//   - The cookie holds only {v, iat, exp} plus an HMAC-SHA256 signature; no password or token.
//   - The signing key is derived from ADMIN_SESSION_SECRET *and* ADMIN_PASSWORD, so changing either
//     one logs every existing session out.
//   - Sessions last 12 hours. Cookie: httpOnly (no JavaScript access), Secure (HTTPS only; browsers
//     also allow it on http://localhost), SameSite=Strict (never sent on cross-site requests).
//   - Password and signature checks use constant-time comparison.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sotm_admin";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionKeys {
  sessionSecret: string;
  password: string;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function signingKey(k: SessionKeys): Buffer {
  return createHmac("sha256", k.sessionSecret).update(`sotm-admin-session-v1\0${k.password}`).digest();
}

function mac(k: SessionKeys, payload: string): Buffer {
  return createHmac("sha256", signingKey(k)).update(payload).digest();
}

export function signSession(k: SessionKeys, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload = b64url(JSON.stringify({ v: 1, iat, exp: iat + SESSION_TTL_SECONDS }));
  return `${payload}.${b64url(mac(k, payload))}`;
}

export function verifySession(k: SessionKeys, token: string | undefined | null, nowMs = Date.now()): boolean {
  if (!token || typeof token !== "string" || token.length > 512) return false;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return false;
  const given = Buffer.from(sig, "base64url");
  const want = mac(k, payload);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: number; iat?: number; exp?: number };
    const now = Math.floor(nowMs / 1000);
    if (p.v !== 1 || typeof p.iat !== "number" || typeof p.exp !== "number") return false;
    if (p.iat > now + 60) return false; // issued in the future
    if (p.exp - p.iat > SESSION_TTL_SECONDS) return false;
    return now < p.exp;
  } catch {
    return false;
  }
}

/** Constant-time password check (hashing first makes both sides the same length). */
export function checkPassword(expected: string, given: unknown): boolean {
  if (!expected || typeof given !== "string" || given.length === 0 || given.length > 1024) return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const sessionCookieOptions = (maxAge = SESSION_TTL_SECONDS) => ({
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge,
});
