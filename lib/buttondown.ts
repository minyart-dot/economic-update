// Minimal Buttondown API client (spec Section 13). Server-side only: the API key never
// reaches the browser. Docs: https://docs.buttondown.com/api-introduction

// Read at call time so tests (and scripts) can point it at a local stand-in.
const base = () => process.env.BUTTONDOWN_API_BASE ?? "https://api.buttondown.com/v1";

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

async function call(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<{ ok: boolean; status: number; text: string }> {
  let last: { ok: boolean; status: number; text: string } = { ok: false, status: 0, text: "" };
  // Retry twice with backoff on network errors and 5xx (spec 12.4).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base()}${path}`, {
        method,
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

// ---- Tag-only emails (between-edition volatility alerts, spec Section 9 / 12.3) -------------

/** Buttondown tag carried by subscribers who ticked "Also send me market alerts" (app/api/subscribe). */
export const ALERTS_TAG = "alerts";

export interface TagCondition {
  field: "subscriber.tags";
  operator: "contains";
  value: string;
}
export interface TagOnlyAudience {
  predicate: "and";
  groups: [];
  filters: TagCondition[];
}

/**
 * The audience restriction sent with an email so it reaches ONLY subscribers carrying `tag`.
 *
 * Buttondown replaced the email fields `included_tags` / `excluded_tags` with a single `filters`
 * object (API changelog 2024-08-15; docs page "api-emails-filters"):
 *   { "predicate": "and", "groups": [], "filters": [{ "field": "subscriber.tags", "operator": "contains", "value": "<tag>" }] }
 *
 * UNCERTAINTY: this shape comes from Buttondown's published docs/changelog as seen through a web
 * search; the docs site itself could not be opened when this was written. In particular, whether
 * `value` is the tag NAME (assumed here, as in the docs examples) or the tag ID is not confirmed.
 * That is why sendTagOnlyEmail() always creates a draft first, checks that Buttondown echoes this
 * filter back on the saved email, and refuses to send otherwise. Check the audience of the first
 * draft in Buttondown before relying on --send.
 */
export function tagOnlyAudience(tag: string): TagOnlyAudience {
  const t = tag.trim();
  if (!t) throw new Error("A tag is required for a tag-only email");
  return { predicate: "and", groups: [], filters: [{ field: "subscriber.tags", operator: "contains", value: t }] };
}

/**
 * True when a Buttondown email (as returned by the API) is restricted to subscribers with `tag`:
 * a top-level "and" predicate that includes the condition subscriber.tags contains <tag>. With
 * "and", any extra conditions or groups can only narrow the audience, never widen it.
 */
export function audienceApplied(email: unknown, tag: string): boolean {
  const f = (email as { filters?: unknown } | null)?.filters as Partial<TagOnlyAudience> | undefined;
  if (!f || typeof f !== "object" || f.predicate !== "and" || !Array.isArray(f.filters)) return false;
  return f.filters.some(
    (c) => c && c.field === "subscriber.tags" && c.operator === "contains" && String(c.value).trim() === tag.trim(),
  );
}

export type TagOnlyResult =
  | { kind: "draft"; id: string }
  | { kind: "sent"; id: string }
  | { kind: "refused"; id: string | null; reason: string }
  | { kind: "error"; id: string | null; reason: string };

/**
 * Creates an email restricted to subscribers tagged `tag`. Never sends to the whole list:
 *   1. POST /emails as a DRAFT with the tag filter (nothing is sent at this step),
 *   2. check the saved email carries the filter; if not, stop ("refused") and leave the draft,
 *   3. only when `send` is true, PATCH the draft to status "about_to_send".
 */
export async function sendTagOnlyEmail(opts: { subject: string; body: string; tag: string; send: boolean }): Promise<TagOnlyResult> {
  let audience: TagOnlyAudience;
  try {
    audience = tagOnlyAudience(opts.tag);
  } catch (e) {
    return { kind: "refused", id: null, reason: (e as Error).message };
  }
  const created = await call("/emails", { subject: opts.subject, body: opts.body, status: "draft", filters: audience });
  if (!created.ok) return { kind: "error", id: null, reason: `Buttondown returned ${created.status}: ${created.text.slice(0, 300)}` };
  let email: { id?: unknown } | null = null;
  try {
    email = JSON.parse(created.text);
  } catch {
    // not JSON: treated as "audience not confirmed" below
  }
  const id = email && email.id != null ? String(email.id) : null;
  if (!audienceApplied(email, opts.tag)) {
    return {
      kind: "refused",
      id,
      reason: `Buttondown did not confirm the "${opts.tag}"-only audience on the saved email, so nothing was sent. A draft may exist in Buttondown: check or delete it there.`,
    };
  }
  if (!id) return { kind: "refused", id: null, reason: "Buttondown did not return an email id, so nothing was sent." };
  if (!opts.send) return { kind: "draft", id };
  const sent = await call(`/emails/${encodeURIComponent(id)}`, { status: "about_to_send" }, "PATCH");
  if (!sent.ok) {
    return { kind: "error", id, reason: `Could not send draft ${id}: Buttondown returned ${sent.status}: ${sent.text.slice(0, 300)}` };
  }
  return { kind: "sent", id };
}
