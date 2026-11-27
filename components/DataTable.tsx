import type { ReactNode } from "react";

export interface Column {
  header: string;
  className?: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
}

/**
 * Navy header row, zebra rows, teal uppercase group labels. On mobile the table scrolls
 * horizontally with a sticky first column (spec 4.4 #9).
 */
export function DataTable({
  columns,
  rows,
  caption,
  minWidth = 640,
}: {
  columns: Column[];
  rows: { cells?: ReactNode[]; group?: string; groupStart?: boolean }[];
  caption?: string;
  minWidth?: number;
}) {
  return (
    <div className="table-scroll relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={`bg-navy px-2.5 py-2 text-left text-[11.5px] font-semibold text-white ${
                  c.numeric ? "text-right" : ""
                } ${i === 0 ? "sticky left-0 z-10" : ""} ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            if (r.group) {
              return (
                <tr key={ri} className="border-t border-border bg-white">
                  <th
                    scope="colgroup"
                    colSpan={columns.length}
                    className="sticky left-0 px-2.5 pt-3 pb-1 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-teal"
                  >
                    {r.group}
                  </th>
                </tr>
              );
            }
            const zebra = ri % 2 === 1 ? "bg-panel" : "bg-white";
            return (
              <tr key={ri} className={`${zebra} ${r.groupStart && ri > 0 ? "border-t border-border" : ""}`}>
                {(r.cells ?? []).map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-2.5 py-1.5 align-top ${columns[ci]?.numeric ? "text-right tabular-nums" : ""} ${
                      ci === 0 ? `sticky left-0 z-[1] ${zebra}` : ""
                    } ${columns[ci]?.className ?? ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-teal">{children}</span>;
}
