/** Navy number circle, H2 title and kicker, with a 1.5px navy rule (spec 4.4 #2). */
export function SectionHeader({ number, title, kicker, id }: { number: string; title: string; kicker: string; id?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b-[1.5px] border-navy pb-2.5">
      {number && (
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-bold text-white"
        >
          {number}
        </span>
      )}
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="text-[22px] font-bold leading-tight text-navy">
          {title}
        </h2>
        <p className="mt-0.5 text-[12px] text-muted">{kicker}</p>
      </div>
    </div>
  );
}
