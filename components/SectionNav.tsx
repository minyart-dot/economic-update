"use client";

import { useEffect, useState } from "react";

export interface NavItem {
  id: string;
  number: string;
  label: string;
  topics?: string;
}

/** Sticky left rail on desktop; horizontally scrolling chip bar on mobile (spec 4.4 #15). */
export function SectionNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -75% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

  useEffect(() => {
    const chip = document.getElementById(`chip-${active}`);
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <>
      {/* Mobile and tablet: chip bar */}
      <nav aria-label="Sections" className="no-print sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur lg:hidden">
        <ul className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2">
          {items.map((it) => (
            <li key={it.id} className="shrink-0" data-topics={it.topics}>
              <a
                id={`chip-${it.id}`}
                href={`#${it.id}`}
                aria-current={active === it.id ? "location" : undefined}
                className={`block rounded-full border px-3 py-1 text-[12px] font-semibold whitespace-nowrap ${
                  active === it.id ? "border-navy bg-navy text-white" : "border-border text-dark hover:border-teal"
                }`}
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: sticky left rail */}
      <nav aria-label="Sections" className="no-print hidden lg:block">
        <ul className="sticky top-4 space-y-0.5 border-l border-border py-1">
          {items.map((it) => (
            <li key={it.id} data-topics={it.topics}>
              <a
                href={`#${it.id}`}
                aria-current={active === it.id ? "location" : undefined}
                className={`-ml-px flex gap-2 border-l-2 py-1 pl-3 text-[13px] leading-snug ${
                  active === it.id
                    ? "border-teal font-semibold text-navy"
                    : "border-transparent text-muted hover:border-grey hover:text-ink"
                }`}
              >
                <span className="w-5 shrink-0 text-[11px] font-bold text-teal">{it.number}</span>
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
