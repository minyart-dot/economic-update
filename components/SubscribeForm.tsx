/**
 * Email field + "Subscribe free" (spec 4.4 #14, 13.1). Posts to Buttondown's embed endpoint
 * when NEXT_PUBLIC_BUTTONDOWN_USERNAME is set. Phase 4 replaces this with a server API route
 * (keeps the username private, adds rate limiting) and the /subscribe/thanks flow.
 */
export function SubscribeForm({ compact = false, id }: { compact?: boolean; id?: string }) {
  const user = process.env.NEXT_PUBLIC_BUTTONDOWN_USERNAME;
  const action = user ? `https://buttondown.com/api/emails/embed-subscribe/${user}` : undefined;
  return (
    <form
      id={id}
      action={action}
      method="post"
      className="no-print w-full max-w-md"
      aria-label="Subscribe to the monthly email"
    >
      <div className="flex gap-2">
        <label htmlFor={`${id ?? "sub"}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id ?? "sub"}-email`}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        {/* Honeypot: real people leave this empty. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button
          type="submit"
          disabled={!action}
          title={action ? undefined : "Email signup is connected in Phase 4"}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-[#186574] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Subscribe free
        </button>
      </div>
      {!compact && (
        <label className="mt-2 flex items-center gap-2 text-[12px] text-dark">
          <input type="checkbox" name="tag" value="alerts" className="accent-teal" />
          Also send me market alerts when volatility spikes
        </label>
      )}
      <p className="mt-1.5 text-[12px] text-muted">
        One email a month. Unsubscribe anytime. We only use your email to send this brief. No sharing.
      </p>
    </form>
  );
}
