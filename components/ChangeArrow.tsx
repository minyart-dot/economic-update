import { ARROW, PILL_WORD, srText } from "@/lib/compare";
import type { ChangeColor, Direction, Metric } from "@/lib/types";

const TEXT: Record<ChangeColor, string> = {
  good: "text-good",
  bad: "text-bad",
  neutral: "text-neutral",
};
const PILL: Record<ChangeColor, string> = {
  good: "bg-good-bg text-good-text",
  bad: "bg-bad-bg text-bad-text",
  neutral: "bg-neutral-bg text-neutral",
};

/** Small grey "y/y" tag that always accompanies an arrow. */
export function YoyTag() {
  return (
    <span className="ml-1 rounded-sm border border-border px-1 py-px align-middle text-[10px] font-semibold leading-none text-muted">
      y/y
    </span>
  );
}

/**
 * Shape = direction, color = how the change is generally read (spec 4.4 #5, Section 5).
 * Renders nothing when there is no like-for-like year-ago comparison.
 */
export function ChangeArrow({
  metric,
  direction,
  color,
  showTag = true,
  className = "",
}: {
  metric?: Metric;
  direction?: Direction | null;
  color?: ChangeColor | null;
  showTag?: boolean;
  className?: string;
}) {
  const d = direction ?? metric?.direction ?? null;
  const c = color ?? metric?.color ?? null;
  if (!d || !c || (metric && metric.comparison_basis !== "y/y")) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className}`}>
      <span aria-hidden="true" className={`${TEXT[c]} text-[0.8em] leading-none`}>
        {ARROW[d]}
      </span>
      <span className="sr-only">{srText(d, c)}</span>
      {showTag && <YoyTag />}
    </span>
  );
}

/** Rounded pill for tables: "▲ Higher", "▼ Lower" or "▶ Unchanged" (spec 4.4 #6). Never wraps. */
export function ChangePill({
  metric,
  direction,
  color,
  label,
}: {
  metric?: Metric;
  direction?: Direction | null;
  color?: ChangeColor | null;
  label?: string;
}) {
  const d = direction ?? metric?.direction ?? null;
  const c = color ?? metric?.color ?? null;
  if (!d || !c) {
    return (
      <span className="text-muted" title="No like-for-like year-ago value">
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${PILL[c]}`}
    >
      <span aria-hidden="true" className="text-[10px]">
        {ARROW[d]}
      </span>
      {label ?? PILL_WORD[d]}
      <span className="sr-only"> ({srText(d, c)})</span>
    </span>
  );
}
