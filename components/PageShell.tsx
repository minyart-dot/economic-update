import Link from "next/link";
import type { ReactNode } from "react";
import { latestEditionId, loadEditionSeed } from "@/lib/data";
import { Footer } from "./Footer";
import { HeaderBand } from "./HeaderBand";

/** Header + narrow content column + footer, for the non-edition pages. */
export function PageShell({ children, showFooterForm = true }: { children: ReactNode; showFooterForm?: boolean }) {
  const seed = loadEditionSeed(latestEditionId());
  return (
    <>
      <HeaderBand editionLabel={seed.edition_label} dataAsOf={seed.data_as_of_label} subscribeHref="/subscribe" />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <p className="text-[13px]">
          <Link href="/" className="source-link">
            ← Latest edition
          </Link>
        </p>
        {children}
      </main>
      <Footer editionLabel={seed.edition_label} showForm={showFooterForm} />
    </>
  );
}
