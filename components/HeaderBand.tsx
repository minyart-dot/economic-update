import Link from "next/link";

/** Navy header band with the teal/orange stripe (spec 4.2, 4.4 #1). */
export function HeaderBand({ editionLabel, dataAsOf }: { editionLabel: string; dataAsOf: string }) {
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-[1340px] flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:py-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-eyebrow">
            Monthly brief for real estate investors
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight lg:text-[40px]">
            <Link href="/" className="hover:opacity-90">
              State of the Market
            </Link>
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-white/80 sm:text-sm">
            U.S. and Texas · Houses, flips, new construction, land, rentals, manufactured homes, office, industrial
          </p>
        </div>
        <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold">{editionLabel}</p>
            <p className="text-[12px] text-white/70">Data as of {dataAsOf}</p>
          </div>
          <a
            href="#subscribe"
            className="no-print rounded-md bg-orange px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#c96a22] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Subscribe free
          </a>
        </div>
      </div>
      <div className="flex h-[5px]" aria-hidden="true">
        <div className="w-[60%] bg-teal" />
        <div className="w-[40%] bg-orange" />
      </div>
    </header>
  );
}
