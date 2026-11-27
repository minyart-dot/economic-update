import type { Metric, Tone } from "@/lib/types";
import { ChangeArrow } from "./ChangeArrow";
import { SourceLink } from "./SourceLink";

const TONE: Record<Tone, string> = {
  teal: "border-t-teal",
  orange: "border-t-orange",
  navy: "border-t-navy",
};

/** Label, value, arrow + y/y tag, sub-line and source (spec 4.4 #3). Tone is decorative only. */
export function StatTile({
  metric,
  label,
  sub,
  tone,
}: {
  metric: Metric;
  label?: string;
  sub: string;
  tone: Tone;
}) {
  const missing = metric.value == null;
  return (
    <div className={`avoid-break rounded-md border border-border border-t-[3px] bg-white p-3 sm:p-4 ${TONE[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label ?? metric.label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-[26px] font-bold leading-none text-navy">
        <span title={missing ? "Not yet released" : undefined}>{metric.display}</span>
        <ChangeArrow metric={metric} className="text-[18px]" />
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</p>
      <p className="mt-1 text-[11px] text-muted">
        <SourceLink href={metric.source_url} title={`As of ${metric.as_of}`}>
          {metric.source_name}
        </SourceLink>
      </p>
    </div>
  );
}
