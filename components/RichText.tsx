import type { ReactNode } from "react";
import type { Bullet, Link } from "@/lib/types";
import { SourceLink } from "./SourceLink";

/**
 * Renders plain text and wraps the first occurrence of each link phrase in a SourceLink
 * (spec Section 10.3). Phrases that do not occur are ignored (the validator flags them).
 */
export function RichText({ text, links = [] }: { text: string; links?: Link[] }) {
  const hits: { start: number; end: number; url: string }[] = [];
  for (const l of links) {
    const start = text.indexOf(l.phrase);
    if (start < 0) continue;
    const end = start + l.phrase.length;
    if (hits.some((h) => start < h.end && end > h.start)) continue;
    hits.push({ start, end, url: l.url });
  }
  hits.sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let i = 0;
  hits.forEach((h, k) => {
    if (h.start > i) parts.push(text.slice(i, h.start));
    parts.push(
      <SourceLink key={k} href={h.url}>
        {text.slice(h.start, h.end)}
      </SourceLink>,
    );
    i = h.end;
  });
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

export function BulletList({ bullets, className = "" }: { bullets: Bullet[]; className?: string }) {
  return (
    <ul className={`list-disc space-y-1.5 pl-5 marker:text-teal ${className}`}>
      {bullets.map((b, i) => (
        <li key={i}>
          {b.lead && <em className="font-semibold not-italic text-navy">{b.lead} </em>}
          <RichText text={b.text} links={b.links} />
        </li>
      ))}
    </ul>
  );
}
