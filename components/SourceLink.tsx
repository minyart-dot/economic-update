import type { ReactNode } from "react";

/** Inline link with a dotted teal underline that opens in a new tab (spec 4.4 #11). */
export function SourceLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="source-link" title={title}>
      {children}
    </a>
  );
}
