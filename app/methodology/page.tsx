import type { Metadata } from "next";
import Link from "next/link";
import { Callout, NoteBox } from "@/components/Callout";
import { ChangePill } from "@/components/ChangeArrow";
import { Footer } from "@/components/Footer";
import { HeaderBand } from "@/components/HeaderBand";
import { SectionHeader } from "@/components/SectionHeader";
import { latestEditionId, loadEditionSeed } from "@/lib/data";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = { title: "Methodology and glossary" };

export default function Methodology() {
  const seed = loadEditionSeed(latestEditionId());
  return (
    <>
      <HeaderBand editionLabel={seed.edition_label} dataAsOf={seed.data_as_of_label} />
      <main id="main" className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
        <p className="text-[13px]">
          <Link href="/" className="source-link">
            ← Back to the latest edition
          </Link>
        </p>

        <section className="space-y-4">
          <SectionHeader number="1" title="Comparisons and arrows" kicker="Every arrow is year over year" />
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Every arrow compares the latest reading with the <strong>same period one year earlier (y/y)</strong>: October
              vs. October, Q3 vs. Q3, Jan–Sep vs. Jan–Sep. A small &ldquo;y/y&rdquo; tag sits next to every arrow.
            </li>
            <li>
              Other comparisons are spelled out in words: m/m, YTD, annual pace (SAAR), vs. 2019, 20-year average
              (2006–2025), peak/low.
            </li>
            <li>
              If no like-for-like year-ago value exists, no arrow is shown. If the nearest month is used instead, it is
              marked with an asterisk and a footnote.
            </li>
            <li>
              When a source publishes only the y/y change (for example &ldquo;+3.3% vs. Q2 2025&rdquo;) and not the year-ago level, the
              reported change sets the arrow.
            </li>
            <li>
              A change smaller than the metric&rsquo;s flat threshold (by default 1% relative, or 0.05 points for rates) is shown as
              flat (▶).
            </li>
            <li>Figures from different sources or methods are never compared as if they were one series.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <SectionHeader number="2" title="Colors" kicker="How a change is generally read for the broad economy" />
          <p>
            Arrows show direction vs. a year ago (▲ ▼ ▶). Color shows how the change is generally read: green favorable, red
            unfavorable, black flat or mixed (e.g., higher prices help owners but hurt buyers). Data only; no forecast.
          </p>
          <div className="flex flex-wrap gap-3">
            <ChangePill direction="down" color="good" label="Lower (e.g., unemployment)" />
            <ChangePill direction="up" color="bad" label="Higher (e.g., mortgage rate)" />
            <ChangePill direction="up" color="neutral" label="Higher (mixed: home prices)" />
            <ChangePill direction="flat" color="neutral" />
          </div>
          <NoteBox>
            Metrics marked mixed always render black: home prices, building permits, months of inventory, manufactured home
            output, land prices, rents, AI capex, Fed funds, dollar index and yield curve level. They help some investors and
            hurt others.
          </NoteBox>
        </section>

        <section className="space-y-4">
          <SectionHeader number="3" title="Market alert" kicker="Set automatically from the latest VIX close" />
          <p>{seed.notes.vix_rule}</p>
        </section>

        <section className="space-y-4">
          <SectionHeader number="4" title="Correlations" kicker="Pearson correlation on annual series" />
          <Callout title="What a correlation means">
            <p>Correlation shows two series moved together, not that one caused the other.</p>
          </Callout>
          <p>{seed.notes.correlations}</p>
        </section>

        <section className="space-y-4">
          <SectionHeader number="5" title="Glossary" kicker="Terms used across the brief" />
          <dl className="space-y-2">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt className="inline font-semibold text-navy">{g.term}: </dt>
                <dd className="inline">{g.definition}</dd>
              </div>
            ))}
          </dl>
          <p className="italic">Not investment advice.</p>
        </section>
      </main>
      <Footer editionLabel={seed.edition_label} />
    </>
  );
}
