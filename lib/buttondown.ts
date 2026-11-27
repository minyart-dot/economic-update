// Minimal Buttondown API client (spec Section 13). Server-side only: the API key never
// reaches the browser. Docs: https://docs.buttondown.com/api-introduction

const BASE = process.env.BUTTONDOWN_API_BASE ?? "https://api.buttondown.com/v1";

export class ButtondownNotConfigured extends Error {
  constructor() {
    super("BUTTONDOWN_API_KEY is not set");
  }
}

function key(): string {
  const k = process.env.BUTTONDOWN_API_KEY;
  if (!k) throw new ButtondownNotConfigured();
  return k;
}

async function call(path: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  let last: { ok: boolean; status: number; text: string } = { ok: false, status: 0, text: "" };
  // Retry twice with backoff on network errors and 5xx (spec 12.4).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Token ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      last = { ok: res.ok, status: res.status, text: await res.text() };
      if (res.status < 500) return last;
    } catch (e) {
      if (e instanceof ButtondownNotConfigured) throw e;
      last = { ok: false, status: 0, text: String(e) };
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return last;
}

export type SubscribeResult = "created" | "exists" | "invalid" | "error";

/**
 * Adds a subscriber. Buttondown sends the double opt-in confirmation email itself
 * (turn on "double opt-in" in the newsletter settings).
 */
export async function addSubscriber(email: string, tags: string[], meta: { ip?: string; referrer?: string }): Promise<SubscribeResult> {
  const r = await call("/subscribers", {
    email_address: email,
    tags,
    ...(meta.ip ? { ip_address: meta.ip } : {}),
    ...(meta.referrer ? { referrer_url: meta.referrer } : {}),
  });
  if (r.ok) return "created";
  if (r.status === 400 || r.status === 409 || r.status === 422) {
    if (/already|exists|duplicate/i.test(r.text)) return "exists";
    return "invalid";
  }
  console.error("Buttondown subscribe failed", r.status, r.text.slice(0, 300));
  return "error";
}

export interface EmailDraft {
  subject: string;
  body: string;
  /** "draft" leaves it in Buttondown for review; "about_to_send" sends to all subscribers. */
  status: "draft" | "about_to_send";
}

export async function createEmail(draft: EmailDraft): Promise<{ ok: boolean; status: number; text: string }> {
  return call("/emails", draft);
}
