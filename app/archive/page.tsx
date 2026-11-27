import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";
import { loadEditionSeed, loadMetricsConfig, publicEditions } from "@/lib/data";
import { enrichMetrics } from "@/lib/edition";
import { buildAlert } from "@/lib/alert";

export const metadata: Metadata = { title: "Past editions" };

const CHIP = {
  normal: "bg-good-bg text-good-text",
  elevated: "bg-[#fdf3e3] text-ink",
  high: "bg-bad-bg text-bad-text",
  extreme: "bg-alert-extreme text-white",
} as const;

export default function Archive() {
  const cfg = loadMetricsConfig();
  const editions = publicEditions()
    .map((id) => loadEditionSeed(id))
    .reverse();
  return (
    <PageShell>
      <SectionHeader number="▤" title="Past editions" kicker="Every month stays available as it was published" />
      <ul className="divide-y divide-border rounded-md border border-border">
        {editions.map((e) => {
          const m = enrichMetrics(e, cfg);
          const a = buildAlert(m.vix.value!, m.vix.period_label, m.yield_curve?.value ?? null);
          return (
            <li key={e.edition} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/archive/${e.edition}`} className="font-semibold text-navy hover:underline">
                  {e.edition_label}
                </Link>
                <p className="text-[13px] text-dark">{e.headline_summary}</p>
              </div>
              <span className={`w-fit whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP[a.level]}`}>
                VIX {a.level} · {a.vix_display}
              </span>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
