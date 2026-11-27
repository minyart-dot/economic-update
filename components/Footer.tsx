import Link from "next/link";
import { SubscribeForm } from "./SubscribeForm";

/** Footer with subscribe form, disclaimer and methodology link (spec 4.4 #16). */
export function Footer({ editionLabel }: { editionLabel: string }) {
  return (
    <footer className="mt-16 border-t-[3px] border-navy bg-panel">
      <div className="mx-auto grid max-w-[1340px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-2">
        <div>
          <p className="text-[15px] font-bold text-navy">Get the brief by email</p>
          <p className="mb-3 text-[13px] text-muted">A short summary when each monthly edition is published.</p>
          <SubscribeForm id="subscribe" />
        </div>
        <div className="text-[13px] text-dark md:text-right">
          <p className="font-semibold text-navy">State of the Market · Real Estate Investor Brief · {editionLabel}</p>
          <p className="mt-1 font-semibold">Data only; not investment advice.</p>
          <p className="mt-1 text-muted">
            Every figure links to its source. Arrows compare with the same period a year earlier.
          </p>
          <p className="mt-3 flex gap-4 md:justify-end">
            <Link href="/methodology" className="source-link">
              Methodology and glossary
            </Link>
            <a href="#references" className="source-link">
              References
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
