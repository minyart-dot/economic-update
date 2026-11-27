"use client";

import { useState, type FormEvent } from "react";

/**
 * Email field + "Subscribe free" (spec 4.4 #14, 13.1). Posts to /api/subscribe, which adds
 * the address to Buttondown. Works without JavaScript (normal form post and redirect);
 * with JavaScript it confirms inline.
 */
export function SubscribeForm({ id, compact = false, dark = false }: { id: string; compact?: boolean; dark?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), website: f.get("website"), alerts: f.get("alerts") === "on" }),
      });
      const body = await res.json().catch(() => ({ ok: false, message: "Something went wrong. Please try again later." }));
      setMessage(body.message);
      setState(body.ok ? "done" : "error");
    } catch {
      setMessage("Could not reach the server. Please try again.");
      setState("error");
    }
  }

  const text = dark ? "text-white/85" : "text-dark";

  if (state === "done") {
    return (
      <div id={id} role="status" className={`no-print max-w-md rounded-md border-l-4 border-teal px-3 py-2 text-sm ${dark ? "bg-white/10 text-white" : "bg-white text-ink"}`}>
        <p className="font-semibold">Almost done.</p>
        <p>{message}</p>
      </div>
    );
  }

  return (
    <form id={id} action="/api/subscribe" method="post" onSubmit={onSubmit} className="no-print w-full max-w-md" aria-label="Subscribe to the monthly email">
      <div className="flex gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="min-h-10 w-0 min-w-0 flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        {/* Honeypot: real people leave this empty. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button
          type="submit"
          disabled={state === "sending"}
          className="min-h-10 shrink-0 rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-[#186574] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Subscribe free"}
        </button>
      </div>
      {!compact && (
        <label className={`mt-2 flex items-center gap-2 text-[12px] ${text}`}>
          <input type="checkbox" name="alerts" className="h-4 w-4 accent-teal" />
          Also send me market alerts when volatility spikes
        </label>
      )}
      {state === "error" && (
        <p role="alert" className={`mt-1.5 text-[12px] font-semibold ${dark ? "text-white" : "text-bad-text"}`}>
          {message}
        </p>
      )}
      <p className={`mt-1.5 text-[12px] ${text}`}>One email a month. Unsubscribe anytime. We only use your email to send this brief. No sharing.</p>
    </form>
  );
}
