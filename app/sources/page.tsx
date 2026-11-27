import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";
import { SourceLink } from "@/components/SourceLink";
import { latestEditionId } from "@/lib/data";
import { getEdition } from "@/lib/edition";
import { hostname } from "@/lib/format";
import { pdfHref } from "@/lib/pdf";

export const metadata: Metadata = {
  title: "Sources",
  description: "Every source used in the latest State of the Market edition, grouped by section.",
};

/** Full reference list for the latest edition, grouped by section (spec 3.1, 6.16). */
export default function Sources() {
  const ed = getEdition(latestEditionId());
  const count = ed.references.reduce((n, g) => n + g.items.length, 0);
  const pdf = pdfHref(ed.edition);
  return (
    <PageShell active="sources">
      <section className="space-y-4">
        <SectionHeader number="" title="Sources" kicker={`Every source used in the ${ed.edition_label} edition`} />
        <p className="text-[14px] text-dark">
          {count} sources, de-duplicated and grouped by the section where each first appears. Every figure on the{" "}
          <Link href={`/archive/${ed.edition}`} className="source-link">
            {ed.edition_label} edition
          </Link>{" "}
          links to one of these.{" "}
          {pdf && (
            <>
              The edition is also available as a{" "}
              <a href={pdf} download className="source-link">
                PDF
              </a>
              .
            </>
          )}
        </p>
      </section>
      {ed.references.map((g) => (
        <section key={g.section} aria-labelledby={`src-${g.section}`} className="break-inside-avoid">
          <h2 id={`src-${g.section}`} className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-teal">
            {g.title}
          </h2>
          <ul className="space-y-1.5 text-[14px]">
            {g.items.map((it) => (
              <li key={it.url} className="leading-snug">
                <SourceLink href={it.url}>{it.title}</SourceLink>{" "}
                <span className="text-[12px] text-muted">{hostname(it.url)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
