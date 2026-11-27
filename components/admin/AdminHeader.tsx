/** Navy band for the admin pages, with a logout button when signed in. */
export function AdminHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-eyebrow uppercase">State of the Market</p>
          <p className="text-[17px] font-bold">Monthly numbers</p>
        </div>
        {signedIn && (
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="min-h-10 rounded-md border border-white/40 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Log out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
