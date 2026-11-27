// Link-preview image (Open Graph / Twitter card) for an edition: brand band, month, headline
// and the four headline numbers. Rendered at build time with next/og.

import { ImageResponse } from "next/og";
import { getEdition } from "./edition";

export const OG_SIZE = { width: 1200, height: 630 };

const C = { navy: "#14213D", teal: "#1F7A8C", orange: "#E07A2E", ink: "#1E2430", muted: "#5C6470", panel: "#F4F6F8", eyebrow: "#9FB4CC" };
const CHANGE = { good: "#1E7A36", bad: "#B22222", neutral: "#1E2430" } as const;

/** Arrow drawn as a shape: the default image font has no ▲▼▶ glyphs. */
function Arrow({ direction, color }: { direction: "up" | "down" | "flat"; color: string }) {
  const points = direction === "up" ? "0,22 13,0 26,22" : direction === "down" ? "0,0 26,0 13,22" : "0,0 22,11 0,22";
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" style={{ marginLeft: 12 }}>
      <polygon points={points} fill={color} />
    </svg>
  );
}

export function editionOgImage(editionId: string) {
  const ed = getEdition(editionId);
  const tiles = ed.tiles.headline.map((t) => ({ t, m: ed.metrics[t.metric] }));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", background: C.navy, color: "#fff", padding: "44px 56px 36px" }}>
          <div style={{ fontSize: 22, letterSpacing: 5, color: C.eyebrow, textTransform: "uppercase" }}>Monthly brief for real estate investors</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ fontSize: 68, fontWeight: 700 }}>State of the Market</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: "#ffffff" }}>{ed.edition_label}</div>
          </div>
          <div style={{ fontSize: 30, color: "#D5DDE6", marginTop: 6 }}>{ed.headline_summary}</div>
        </div>
        <div style={{ display: "flex", height: 8 }}>
          <div style={{ width: "60%", background: C.teal }} />
          <div style={{ width: "40%", background: C.orange }} />
        </div>
        <div style={{ display: "flex", gap: 20, padding: "36px 56px 0" }}>
          {tiles.map(({ t, m }) => (
            <div
              key={t.metric}
              style={{ display: "flex", flexDirection: "column", flex: 1, background: C.panel, borderTop: `6px solid ${C[t.tone]}`, padding: "18px 20px", borderRadius: 6 }}
            >
              <div style={{ fontSize: 18, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{t.label ?? m.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 8 }}>
                <div style={{ fontSize: 54, fontWeight: 700, color: C.navy }}>{m.display}</div>
                {m.direction && m.color && <Arrow direction={m.direction} color={CHANGE[m.color]} />}
                {m.direction && <div style={{ fontSize: 18, color: C.muted, marginLeft: 6 }}>y/y</div>}
              </div>
              <div style={{ fontSize: 20, color: C.muted, marginTop: 4 }}>{m.period_label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "26px 56px 0", fontSize: 22, color: C.muted }}>
          <div>U.S. and Texas real estate and economy, every number sourced</div>
          <div>Data only; not investment advice</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
