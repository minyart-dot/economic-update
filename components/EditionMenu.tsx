"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export interface EditionMenuItem {
  id: string;
  label: string;
  headline: string;
  href: string;
}

/**
 * "Editions" dropdown in the header. Built on <details> so it works without JavaScript;
 * with JavaScript it also closes on outside click, Escape and navigation.
 */
export function EditionMenu({ items, currentId }: { items: EditionMenuItem[]; currentId?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDoc = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white [&::-webkit-details-marker]:hidden">
        Editions
        <span aria-hidden="true" className="text-[10px] transition-transform group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-white text-ink shadow-lg">
        <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-dark">
          Monthly editions
        </p>
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.map((it, i) => {
            const current = it.id === currentId;
            return (
              <li key={it.id}>
                <Link
                  href={it.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => ref.current && (ref.current.open = false)}
                  className={`block px-3 py-2 hover:bg-panel focus:bg-panel focus:outline-none ${current ? "border-l-[3px] border-teal bg-panel" : "border-l-[3px] border-transparent"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-navy">{it.label}</span>
                    {i === 0 && <span className="text-[11px] font-semibold text-teal">Latest</span>}
                  </span>
                  <span className="block truncate text-[12px] text-dark">{it.headline}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/archive"
          onClick={() => ref.current && (ref.current.open = false)}
          className="block border-t border-border px-3 py-2 text-[13px] font-semibold text-teal hover:bg-panel"
        >
          All past editions with summaries →
        </Link>
      </div>
    </details>
  );
}
