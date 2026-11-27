import type { AlertLevel, MarketAlert } from "@/lib/types";

const STYLE: Record<AlertLevel, string> = {
  normal: "border-good bg-good-bg text-good-text",
  elevated: "border-alert-amber bg-[#fdf3e3] text-alert-amber",
  high: "border-alert-red bg-bad-bg text-alert-red",
  extreme: "border-alert-extreme bg-alert-extreme text-white",
};

/** VIX alert (spec Section 9). Compact one-liner for the summary; full variant for gauges. */
export function AlertBanner({ alert, variant = "full" }: { alert: MarketAlert; variant?: "compact" | "full" }) {
  const inversion = alert.inverted && alert.inversion_text ? ` · ${alert.inversion_text}` : "";
  if (variant === "compact") {
    const [head] = alert.text.split(", ");
    return (
      <a
        href="#gauges"
        role="status"
        className={`block rounded-md border-l-4 px-3 py-2 text-[13px] font-semibold hover:underline ${STYLE[alert.level]}`}
      >
        {head}
        {alert.level === "normal" ? ", below 20." : ", above 20."}
        {inversion}{" "}
        <span className="font-normal opacity-90">
          Alert levels: 20 elevated · 30 high · 40 extreme.
        </span>
      </a>
    );
  }
  return (
    <div role="status" className={`rounded-md border-l-4 px-4 py-3 text-sm ${STYLE[alert.level]}`}>
      <p className="font-semibold">
        {alert.text}
        {inversion}
      </p>
      <p className="mt-0.5 text-[12px] opacity-90">{alert.thresholds}</p>
    </div>
  );
}
