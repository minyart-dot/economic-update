# State of the Market

A free monthly economic and real estate briefing website for real estate investors (Texas-focused, plus national). Data only; not investment advice.

The full build spec is `STATE_OF_THE_MARKET_SPEC.md` (text) and `docs/State_of_the_Market_Website_Build_Spec.pdf` (source of truth).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Skeleton, design system, all 16 sections from static seed data | **Done** |
| 2 | Charts C1–C17 (Recharts), data-table toggles | Not started (placeholders show chart ID, type and data key) |
| 3 | Data pipeline: fetchers, `build-edition.ts`, `validate-edition.ts`, manual template | Not started |
| 4 | Buttondown subscribe flow, newsletter | Not started (form posts to Buttondown only if `NEXT_PUBLIC_BUTTONDOWN_USERNAME` is set) |
| 5 | GitHub Actions, archive routes, PDF, `/sources` | Not started (`/methodology` exists) |
| 6 | VIX alert emails, admin form, analytics, OG images | Optional |

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static production build
npm run lint
```

Node 20+ is required.

## How the data flows

```
data/config/metrics.yaml    every metric: label, unit, polarity, flat threshold, source, automation, frequency
data/config/sections.yaml   section order, titles, kickers
data/config/sources.yaml    source registry (spec Appendix C)
data/history/*.json         long annual series for charts and correlations (spec Appendix B)
data/editions/YYYY-MM.json  one month's values, text and tables
        │
        ▼
lib/edition.ts              merges config + edition values, then computes:
                            y/y change, direction, color (lib/compare.ts), correlations
                            (lib/analytics.ts), VIX alert (lib/alert.ts), references
        │
        ▼
components/EditionPage.tsx  renders every section; "/" shows the latest published edition
```

Rules the code enforces (spec Section 5):

- Every arrow is year over year and shows a "y/y" tag. No year-ago value means no arrow.
- When a source publishes only the y/y change (e.g. "+3.3% vs. Q2 2025"), the edition stores it as `change_reported` and that sets the arrow.
- Direction and color are computed, never typed. Color = polarity: green favorable, red unfavorable, black flat or `mixed`.
- A change smaller than the metric's `flat_threshold` is flat (▶). Default: 0.05 points for `pct`/`pts` units, 1% relative otherwise.
- Bullets store plain text plus `links: [{phrase, url}]`; the renderer wraps the first occurrence of each phrase in a source link.

## Adding a metric

1. Add it to `data/config/metrics.yaml` with `label`, `unit`, `polarity`, `automation`, `frequency`, `source_name` and `source_url` (and `fred` if it comes from FRED).
2. Add its value to the edition under `metrics`: `value`, `period`, `period_label`, `year_ago` (or `null`) and optionally `ref_2019`, `display`, `footnote`, `notes`.
3. Reference it from a tile (`tiles.*`), a card (`asset_cards`) or a table row (`tables.key_indicators`) by its id.
4. Make sure its source URL is in `data/config/sources.yaml`.

Never estimate a value. If it is missing, use `null`; the page shows "—".

## Not yet documented

Setup for API keys (FRED, BLS), Buttondown and Vercel, plus the monthly owner checklist, arrive with Phases 3–5.
