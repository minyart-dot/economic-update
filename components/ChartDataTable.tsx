"use client";

import { useState } from "react";
import type { ChartTable } from "@/lib/chartData";

/**
 * "View data table" toggle under each chart (spec Section 8). The rows ship with the page (no
 * fetching), but the table is only built when opened, which keeps the page light: 17 always-built
 * tables added ~2,000 DOM nodes most readers never open.
 */
export function ChartDataTable({ title, table }: { title: string; table: ChartTable }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="no-print group mt-1.5 text-[12px]" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded py-1 text-teal hover:underline focus-visible:outline-2 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        <span className="group-open:hidden">View data table</span>
        <span className="hidden group-open:inline">Hide data table</span>
      </summary>
      {open && (
        <div className="mt-2 max-h-80 overflow-auto rounded border border-border">
          <table className="w-full border-collapse text-[12px] tabular-nums">
            <caption className="sr-only">Data for {title}</caption>
            <thead className="sticky top-0">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} scope="col" className={`bg-navy px-2 py-1.5 font-semibold text-white ${i === 0 ? "text-left" : "text-right"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
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
      )}
    </details>
  );
}
