import type { AssetCardSeed, Metric } from "@/lib/types";
import { ChangeArrow } from "./ChangeArrow";
import { BulletList } from "./RichText";
import { SourceLink } from "./SourceLink";

/** Investment-type card: asset name, metric label, value + arrow, 2–3 bullets (spec 4.4 #4). */
export function AssetCard({ card, metric }: { card: AssetCardSeed; metric: Metric }) {
  return (
    <article className="avoid-break flex flex-col rounded-md border border-border bg-white p-4">
      <h3 className="border-b border-border pb-1.5 text-[15px] font-bold text-navy">{card.asset}</h3>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{card.metric_label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-[22px] font-bold leading-none text-navy">
        <SourceLink href={metric.source_url} title={`${metric.source_name} · as of ${metric.as_of}`}>
          <span className="text-navy">{card.value_display ?? metric.display}</span>
        </SourceLink>
        <ChangeArrow metric={metric} className="text-[15px]" />
      </p>
      <BulletList bullets={card.bullets} className="mt-2.5 text-[13.5px] leading-snug" />
    </article>
  );
}
