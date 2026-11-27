// POST /api/admin/logout — clears the session cookie and returns to the login page.

import { NextResponse, type NextRequest } from "next/server";
import { adminConfig } from "@/lib/admin/config";
import { NO_STORE, notFoundJson } from "@/lib/admin/guard";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/admin/session";

export async function POST(req: NextRequest) {
  if (!adminConfig()) return notFoundJson();
  const url = new URL("/admin/login", req.url);
  url.searchParams.set("out", "1");
  const res = NextResponse.redirect(url, { status: 303, headers: NO_STORE });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
