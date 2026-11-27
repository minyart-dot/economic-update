import type { ReactNode } from "react";
import { CHARTS } from "@/lib/charts";
import { SourceLink } from "./SourceLink";
import { hostname } from "@/lib/format";

/**
 * Chart title (bold navy), chart and a muted source caption (spec 4.4 #10).
 * Phase 1: renders a labeled placeholder until the Recharts chart exists (Phase 2).
 */
export function Figure({ id, children, caption }: { id: string; children?: ReactNode; caption?: string }) {
  const spec = CHARTS[id];
  if (!spec) throw new Error(`Unknown chart ${id}`);
  const height = spec.half ? 200 : 240;
  return (
    <figure className="avoid-break min-w-0" aria-label={`${spec.id}: ${spec.title}`}>
      <p className="mb-2 text-[14px] font-bold text-navy">{spec.title}</p>
      {children ?? (
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-grey bg-panel px-4 text-center"
          style={{ height }}
        >
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
            Chart {spec.id} · {spec.type}
          </span>
          <code className="text-[11px] text-muted">{spec.dataKey}</code>
          <span className="text-[11px] text-muted">Placeholder: the chart is built in Phase 2</span>
        </div>
      )}
      <figcaption className="mt-1.5 text-[11px] leading-snug text-muted">
        {caption ?? spec.caption}{" "}
        {spec.sources.map((u, i) => (
          <span key={u}>
            {i === 0 ? "Links: " : " · "}
            <SourceLink href={u}>{hostname(u)}</SourceLink>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
