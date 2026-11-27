import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminConfig } from "@/lib/admin/config";
import { hasValidSession } from "@/lib/admin/guard";

const ERRORS: Record<string, string> = {
  wrong: "That password is not right. Please try again.",
  limited: "Too many attempts. Please wait 15 minutes and try again.",
  origin: "Please log in from this page.",
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string; out?: string }> }) {
  const cfg = adminConfig();
  if (!cfg) notFound(); // invisible until the env vars are set
  if (await hasValidSession(cfg)) redirect("/admin");
  const { error, out } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.wrong) : null;

  return (
    <>
      <AdminHeader signedIn={false} />
      <main id="main" className="mx-auto max-w-sm px-4 py-12">
        <form action="/api/admin/login" method="post" className="space-y-4 rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-navy">Log in</h1>
          {out && !message && (
            <p role="status" className="text-sm text-muted">
              You are logged out.
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-semibold text-ink">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "login-error" : undefined}
              className="min-h-11 w-full rounded-md border border-border bg-white px-3 py-2 text-base text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          {message && (
            <p id="login-error" role="alert" className="text-sm font-semibold text-bad-text">
              {message}
            </p>
          )}
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-teal px-4 py-2 text-base font-semibold text-white hover:bg-[#186574] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            Log in
          </button>
        </form>
      </main>
    </>
  );
}
