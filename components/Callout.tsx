import type { ReactNode } from "react";

/** Panel with a 3px teal left border ("The month in brief", "Big picture", "How to read it"). */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="avoid-break rounded-r-md border-l-[3px] border-teal bg-panel px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-teal">{title}</p>
      <div className="mt-1 text-[15px] leading-relaxed text-ink">{children}</div>
    </aside>
  );
}

/** Small muted methodology note with a grey left border (spec 4.4 #12). */
export function NoteBox({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="avoid-break border-l-2 border-grey pl-3 text-[12px] leading-snug text-muted">
      {title && <span className="font-semibold text-dark">{title}. </span>}
      {children}
    </div>
  );
}
