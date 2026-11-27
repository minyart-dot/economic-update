/** Navy bar listing upcoming release dates (spec 4.4 #13). */
export function NextMonthStrip({ items }: { items: { label: string; date: string }[] }) {
  return (
    <div className="avoid-break flex flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-md bg-navy px-4 py-2.5 text-[13px] text-white">
      <span className="font-bold uppercase tracking-[0.06em] text-eyebrow">Next month:</span>
      {items.map((it, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 && <span className="pr-1.5 text-white/50">·</span>}
          {it.label} <span className="font-semibold">{it.date}</span>
        </span>
      ))}
    </div>
  );
}
