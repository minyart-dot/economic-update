// POST /api/admin/login — owner password -> signed session cookie (lib/admin/session.ts).
// Form post from /admin/login; answers with a 303 redirect. 404 when the admin form is not configured.
// Failed attempts are rate-limited per IP (5 per 15 minutes) and overall (30 per 15 minutes).

import { NextResponse, type NextRequest } from "next/server";
import { adminConfig } from "@/lib/admin/config";
import { NO_STORE, notFoundJson, sameOrigin } from "@/lib/admin/guard";
import { clientIp, createRateLimiter } from "@/lib/admin/rate-limit";
import { SESSION_COOKIE, checkPassword, sessionCookieOptions, signSession } from "@/lib/admin/session";

const WINDOW_MS = 15 * 60 * 1000;
const perIp = createRateLimiter({ windowMs: WINDOW_MS, max: 5 });
const overall = createRateLimiter({ windowMs: WINDOW_MS, max: 30 });

function back(req: NextRequest, error: string) {
  const url = new URL("/admin/login", req.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const cfg = adminConfig();
  if (!cfg) return notFoundJson();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!sameOrigin(req.headers.get("origin"), host)) return back(req, "origin");

  const ip = clientIp(req.headers);
  if (perIp.blocked(ip) || overall.blocked("*")) return back(req, "limited");

  let password: unknown = "";
  try {
    password = (await req.formData()).get("password");
  } catch {
    return back(req, "wrong");
  }
  if (!checkPassword(cfg.password, password)) {
    perIp.hit(ip);
    overall.hit("*");
    return back(req, "wrong");
  }
  perIp.reset(ip);
  const res = NextResponse.redirect(new URL("/admin", req.url), { status: 303, headers: NO_STORE });
  res.cookies.set(SESSION_COOKIE, signSession(cfg), sessionCookieOptions());
  return res;
}
