import type { Metadata } from "next";
import Link from "next/link";
import { ChangeArrow } from "@/components/ChangeArrow";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";
import { buildAlert } from "@/lib/alert";
import { loadEditionSeed, loadMetricsConfig, publicEditions } from "@/lib/data";
import { enrichMetrics } from "@/lib/edition";
import { pdfHref } from "@/lib/pdf";

export const metadata: Metadata = {
  title: "Past editions",
  description: "Every monthly State of the Market edition, as published, with its headline numbers and summary.",
};

const CHIP = {
  normal: "bg-good-bg text-good-text",
  elevated: "bg-[#fdf3e3] text-ink",
  high: "bg-bad-bg text-bad-text",
  extreme: "bg-alert-extreme text-white",
} as const;

const LEVEL = { normal: "normal", elevated: "elevated", high: "high alert", extreme: "extreme" } as const;

export default function Archive() {
  const cfg = loadMetricsConfig();
  const ids = publicEditions().reverse();
  const latest = ids[0];
  const editions = ids.map((id) => {
    const e = loadEditionSeed(id);
    const metrics = enrichMetrics(e, cfg);
    const alert = buildAlert(metrics.vix.value!, metrics.vix.period_label, metrics.yield_curve?.value ?? null);
    return { id, e, metrics, alert, year: id.slice(0, 4), href: id === latest ? "/" : `/archive/${id}`, pdf: pdfHref(id) };
  });
  const years = [...new Set(editions.map((x) => x.year))];

  return (
    <PageShell active="archive">
      <SectionHeader number="▤" title="Past editions" kicker="Every month stays available exactly as it was published" />
      <p className="text-[14px] text-dark">
        Pick a month to read the full edition with its charts, tables and sources, or open the summary below. You can also
        jump between months from the <strong>Editions</strong> menu at the top of any page.
      </p>

      {years.map((year) => (
        <section key={year} aria-labelledby={`year-${year}`} className="space-y-3">
          <h2 id={`year-${year}`} className="border-b border-border pb-1 text-[13px] font-bold uppercase tracking-[0.08em] text-teal">
            {year}
          </h2>
          <ul className="space-y-4">
            {editions
              .filter((x) => x.year === year)
              .map(({ id, e, metrics, alert, href, pdf }) => (
                <li key={id} className="rounded-md border border-border bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[18px] font-bold leading-tight text-navy">
                        <Link href={href} className="hover:underline">
                          {e.edition_label}
                        </Link>
                        {id === latest && (
                          <span className="ml-2 rounded-full bg-teal px-2 py-0.5 align-middle text-[11px] font-semibold text-white">Latest</span>
                        )}
                      </h3>
                      <p className="mt-0.5 text-[14px] text-dark">{e.headline_summary}</p>
                      <p className="text-[12px] text-dark">Data as of {e.data_as_of_label}</p>
                    </div>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP[alert.level]}`}>
                      VIX {LEVEL[alert.level]} · {alert.vix_display}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {e.tiles.headline.map((t) => {
                      const m = metrics[t.metric];
                      return (
                        <div key={t.metric} className="rounded border border-border bg-panel px-2.5 py-2">
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-dark">{t.label ?? m.label}</dt>
                          <dd className="mt-0.5 flex items-baseline gap-1 text-[18px] font-bold text-navy">
                            {m.display}
                            <ChangeArrow metric={m} className="text-[13px]" />
                          </dd>
                          <dd className="text-[11px] text-dark">{m.period_label}</dd>
                        </div>
                      );
                    })}
                  </dl>

                  <details className="group mt-3">
                    <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-[13px] font-semibold text-teal hover:underline [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                        ▸
                      </span>
                      Read the month in brief
                    </summary>
                    <p className="mt-2 border-l-[3px] border-teal bg-panel px-3 py-2 text-[14px] leading-relaxed">{e.month_in_brief}</p>
                  </details>

                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    <Link href={href} className="font-semibold text-teal hover:underline">
                      Read the full edition →
                    </Link>
                    {pdf && (
                      <a href={pdf} download className="source-link">
                        Download PDF
                      </a>
                    )}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
