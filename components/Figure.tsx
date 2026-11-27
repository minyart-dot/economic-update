import type { ReactNode } from "react";
import { CHARTS } from "@/lib/charts";
import type { ChartPayload } from "@/lib/chartData";
import { hostname } from "@/lib/format";
import { LazyChart } from "./charts/LazyChart";
import { SourceLink } from "./SourceLink";

// Rendered height of each chart (legend + plot), reserved while the chart code loads.
const MIN_HEIGHT: Record<string, number> = {
  C1: 262, C2: 262, C3: 302, C4: 262, C5: 200, C6: 222, C7: 224, C8: 200, C9: 222,
  C10: 200, C11: 222, C12: 302, C13: 200, C14: 200, C15: 262, C16: 270, C17: 224,
};

/**
 * Chart title (bold navy), chart, source caption in muted 11px, and a "View data table"
 * toggle (spec 4.4 #10, Section 8). The chart carries an aria-label summary.
 */
export function Figure({ id, payload, children, caption }: { id: string; payload?: ChartPayload; children?: ReactNode; caption?: string }) {
  const spec = CHARTS[id];
  if (!spec) throw new Error(`Unknown chart ${id}`);
  const height = spec.half ? 200 : 240;
  return (
    <figure className="avoid-break min-w-0" data-chart={id}>
      <p className="mb-1.5 text-[14px] font-bold text-navy">{spec.title}</p>
      {payload ? (
        <div role="group" aria-label={`${spec.title}. ${payload.summary}`}>
          <LazyChart id={id} data={payload.data} minHeight={MIN_HEIGHT[id] ?? height + 22} />
        </div>
      ) : (
        children ?? (
          <div className="flex items-center justify-center rounded-md border border-dashed border-grey bg-panel text-[12px] text-muted" style={{ height }}>
            Chart {spec.id} not available
          </div>
        )
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
      {payload && (
        <details className="no-print group mt-1.5 text-[12px]">
          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded py-1 text-teal hover:underline focus-visible:outline-2 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
            <span className="group-open:hidden">View data table</span>
            <span className="hidden group-open:inline">Hide data table</span>
          </summary>
          <div className="mt-2 max-h-80 overflow-auto rounded border border-border">
            <table className="w-full border-collapse text-[12px] tabular-nums">
              <caption className="sr-only">Data for {spec.title}</caption>
              <thead className="sticky top-0">
                <tr>
                  {payload.table.columns.map((c, i) => (
                    <th key={c} scope="col" className={`bg-navy px-2 py-1.5 font-semibold text-white ${i === 0 ? "text-left" : "text-right"}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.table.rows.map((r, ri) => (
                  <tr key={ri} className={ri % 2 ? "bg-panel" : "bg-white"}>
                    {r.map((cell, ci) =>
                      ci === 0 ? (
                        <th key={ci} scope="row" className="px-2 py-1 text-left font-normal">
                          {cell}
                        </th>
                      ) : (
                        <td key={ci} className="px-2 py-1 text-right">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
