// POST /api/subscribe — email signup (spec 13.1). Accepts a normal form post (redirects to
// /subscribe/thanks) or JSON from the enhanced form (returns JSON). Keeps the Buttondown
// key server-side, drops honeypot submissions and rate-limits by IP.

import { NextResponse, type NextRequest } from "next/server";
import { addSubscriber, ButtondownNotConfigured } from "@/lib/buttondown";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>(); // best effort; per server instance

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

type Outcome = { ok: boolean; status: number; message: string };

const MESSAGES = {
  ok: "Check your inbox and click the link to confirm your subscription.",
  invalid: "Please enter a valid email address.",
  limited: "Too many attempts. Please try again in a few minutes.",
  unconfigured: "Email signup is not switched on yet. Please check back soon.",
  error: "Something went wrong on our side. Please try again later.",
};

export async function POST(req: NextRequest) {
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let email = "";
  let honeypot = "";
  let alerts = false;
  try {
    if (isJson) {
      const b = await req.json();
      email = String(b.email ?? "");
      honeypot = String(b.website ?? "");
      alerts = Boolean(b.alerts);
    } else {
      const f = await req.formData();
      email = String(f.get("email") ?? "");
      honeypot = String(f.get("website") ?? "");
      alerts = f.get("alerts") === "on" || f.get("alerts") === "yes";
    }
  } catch {
    return respond(isJson, req, { ok: false, status: 400, message: MESSAGES.invalid });
  }

  email = email.trim().toLowerCase();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  // Bots fill the hidden field; pretend success so they learn nothing.
  if (honeypot) return respond(isJson, req, { ok: true, status: 200, message: MESSAGES.ok });
  if (!EMAIL_RE.test(email) || email.length > 254) return respond(isJson, req, { ok: false, status: 400, message: MESSAGES.invalid });
  if (limited(ip)) return respond(isJson, req, { ok: false, status: 429, message: MESSAGES.limited });

  try {
    const result = await addSubscriber(email, alerts ? ["alerts"] : [], {
      ip: ip === "unknown" ? undefined : ip,
      referrer: req.headers.get("referer") ?? undefined,
    });
    if (result === "created" || result === "exists") {
      // Same message either way, so the form never reveals who is subscribed.
      return respond(isJson, req, { ok: true, status: 200, message: MESSAGES.ok });
    }
    if (result === "invalid") return respond(isJson, req, { ok: false, status: 400, message: MESSAGES.invalid });
    return respond(isJson, req, { ok: false, status: 502, message: MESSAGES.error });
  } catch (e) {
    if (e instanceof ButtondownNotConfigured) return respond(isJson, req, { ok: false, status: 503, message: MESSAGES.unconfigured });
    console.error(e);
    return respond(isJson, req, { ok: false, status: 500, message: MESSAGES.error });
  }
}

function respond(isJson: boolean, req: NextRequest, o: Outcome) {
  if (isJson) return NextResponse.json({ ok: o.ok, message: o.message }, { status: o.status });
  const url = new URL(o.ok ? "/subscribe/thanks" : "/subscribe", req.url);
  if (!o.ok) url.searchParams.set("error", o.message);
  return NextResponse.redirect(url, 303);
}
