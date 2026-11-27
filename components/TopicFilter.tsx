"use client";

import { useEffect, useState } from "react";
import { applyTopics, STORAGE_KEY, TOPICS } from "@/lib/topics";

function readHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((t) => TOPICS.some((x) => x.id === t)) : [];
  } catch {
    return [];
  }
}

/** "Choose your topics" bar: toggle chips saved in this browser only. */
export function TopicFilter() {
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const h = readHidden();
    setHidden(h);
    setReady(true);
  }, []);

  function update(next: string[]) {
    setHidden(next);
    try {
      if (next.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode: the choice just won't persist */
    }
    applyTopics(next);
  }

  const shown = TOPICS.length - hidden.length;
  const summary = !ready || hidden.length === 0 ? "Showing all topics" : `Showing ${shown} of ${TOPICS.length} topics`;

  return (
    <div className="no-print rounded-md border border-border bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-dark">
          <span className="font-semibold text-navy">Your topics:</span> {summary}
          {hidden.length > 0 && <span className="text-dark"> · hidden: {TOPICS.filter((t) => hidden.includes(t.id)).map((t) => t.label).join(", ")}</span>}
        </p>
        <div className="flex items-center gap-3">
          {hidden.length > 0 && (
            <button type="button" onClick={() => update([])} className="min-h-8 text-[13px] font-semibold text-teal hover:underline">
              Show all
            </button>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="topic-chips"
            onClick={() => setOpen((o) => !o)}
            className="min-h-8 rounded-md border border-teal px-3 py-1 text-[13px] font-semibold text-teal hover:bg-teal hover:text-white"
          >
            {open ? "Done" : "Choose topics"}
          </button>
        </div>
      </div>
      {open && (
        <div id="topic-chips" className="mt-2.5 border-t border-border pt-2.5">
          <p className="mb-2 text-[12px] text-dark">
            Tap a topic to hide or show it. Your choice is saved in this browser only; the headline numbers and key context
            always stay.
          </p>
          <ul className="flex flex-wrap gap-2" role="group" aria-label="Topics">
            {TOPICS.map((t) => {
              const on = !hidden.includes(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => update(on ? [...hidden, t.id] : hidden.filter((x) => x !== t.id))}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                      on ? "border-navy bg-navy text-white" : "border-grey bg-white text-dark line-through decoration-grey hover:border-teal"
                    }`}
                  >
                    <span aria-hidden="true">{on ? "✓" : "+"}</span>
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
