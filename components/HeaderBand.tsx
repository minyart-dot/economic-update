import Link from "next/link";
import { loadEditionSeed, publicEditions } from "@/lib/data";
import { EditionMenu } from "./EditionMenu";

export type HeaderTab = "latest" | "archive" | "methodology" | "sources";

// Methodology and Sources also sit in the footer, so phones show only the first two tabs.
const TABS: { id: HeaderTab; label: string; href: string; wide?: boolean }[] = [
  { id: "latest", label: "Latest edition", href: "/" },
  { id: "archive", label: "Past editions", href: "/archive" },
  { id: "methodology", label: "Methodology", href: "/methodology", wide: true },
  { id: "sources", label: "Sources", href: "/sources", wide: true },
];

/** Navy header band with the teal/orange stripe (spec 4.2, 4.4 #1). */
export function HeaderBand({
  editionLabel,
  dataAsOf,
  subscribeHref = "#subscribe-top",
  pdfHref = null,
  active,
  editionId,
}: {
  editionLabel: string;
  dataAsOf: string;
  subscribeHref?: string;
  /** Link to the PDF edition, when one has been rendered (hidden in print). */
  pdfHref?: string | null;
  /** Which tab is highlighted. */
  active?: HeaderTab;
  /** Edition shown on this page, marked in the Editions dropdown. */
  editionId?: string;
}) {
  const editions = publicEditions().reverse();
  const items = editions.map((id, i) => {
    const e = loadEditionSeed(id);
    return { id, label: e.edition_label, headline: e.headline_summary, href: i === 0 ? "/" : `/archive/${id}` };
  });
  return (
    <header className="bg-navy text-white">
      <nav aria-label="Site" className="no-print border-b border-white/10">
        <div className="mx-auto flex max-w-[1340px] items-center justify-between gap-2 px-2 sm:px-4">
          <ul className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto py-1">
            {TABS.map((t) => (
              <li key={t.id} className={`shrink-0 ${t.wide ? "hidden sm:block" : ""}`}>
                <Link
                  href={t.href}
                  aria-current={active === t.id ? "page" : undefined}
                  className={`block rounded-md px-2.5 py-1.5 text-[13px] font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    active === t.id ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="shrink-0">
            <EditionMenu items={items} currentId={editionId} />
          </div>
        </div>
      </nav>
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
            {pdfHref && (
              <a
                href={pdfHref}
                download
                className="no-print mt-0.5 inline-block text-[12px] text-white underline decoration-white/60 underline-offset-2 hover:decoration-white"
              >
                Download PDF
              </a>
            )}
          </div>
          <a
            href={subscribeHref}
            className="no-print rounded-md bg-orange px-3 py-1.5 text-[13px] font-bold text-navy hover:bg-[#ea8d47] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
