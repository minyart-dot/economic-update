// Server-side checks shared by every /admin page and /api/admin route. SECURITY:
//   - Not configured (any env var missing) -> pages call notFound(), routes answer 404.
//   - Every page and route verifies the signed session cookie on the server (no client-side gate).
//   - State-changing routes also require a same-origin Origin header (on top of SameSite=Strict).

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { type AdminConfig, adminConfig } from "./config";
import { SESSION_COOKIE, verifySession } from "./session";

export async function hasValidSession(cfg: AdminConfig): Promise<boolean> {
  const jar = await cookies();
  return verifySession(cfg, jar.get(SESSION_COOKIE)?.value);
}

/** True when the request's Origin header names this same host. */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export const notFoundJson = () => NextResponse.json({ ok: false, message: "Not found" }, { status: 404, headers: NO_STORE });

/** For API routes: the config when the caller has a valid session, else a ready error response. */
export async function requireAdminApi(req: Request, opts: { mutating: boolean }): Promise<{ cfg: AdminConfig } | { response: NextResponse }> {
  const cfg = adminConfig();
  if (!cfg) return { response: notFoundJson() };
  if (opts.mutating) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!sameOrigin(req.headers.get("origin"), host)) {
      return { response: NextResponse.json({ ok: false, message: "Bad origin." }, { status: 403, headers: NO_STORE }) };
    }
  }
  if (!(await hasValidSession(cfg))) {
    return { response: NextResponse.json({ ok: false, message: "Your session has ended. Log in again." }, { status: 401, headers: NO_STORE }) };
  }
  return { cfg };
}
