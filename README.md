# State of the Market

A free monthly economic and real estate briefing website for real estate investors (Texas-focused, plus national). Data only; not investment advice.

The full build spec is `STATE_OF_THE_MARKET_SPEC.md` (text) and `docs/State_of_the_Market_Website_Build_Spec.pdf` (source of truth).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Skeleton, design system, all 16 sections from static seed data | Done |
| 2 | Charts C1–C17 (Recharts), data-table toggles | Done |
| 4 | Email signup (top of page + footer), Buttondown, monthly email, send workflow | Done; needs the accounts below to go live |
| 3 | Data pipeline: fetchers, `build-edition.ts`, `validate-edition.ts`, manual template | Not started |
| 5 | Monthly data PR workflow, PDF, `/sources` | Partly: `/archive`, `/archive/YYYY-MM` and `/methodology` exist |
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

## Edition pipeline commands (Phase 3)

```bash
npm run manual-template -- 2026-12          # writes data/manual/2026-12.yaml (never overwrites); owner fills it in
npm run build:edition -- 2026-12 --draft    # preview build: stale required values only warn
npm run build:edition -- 2026-12            # final build: fails while a required manual value is stale
npm run validate -- 2026-12 --report out/validation-2026-12.md [--draft-summary path.md] [--check-links]
npm test
```

- `build:edition` merges the previous edition (structure and text) + `data/raw/YYYY-MM/auto.json` + `data/manual/YYYY-MM.yaml`
  into `data/editions/YYYY-MM.json` with `status: "draft"`, freezing each metric record per spec 10.2. Narrative and
  table text is copied from the previous edition and printed as NEEDS REVIEW (also stored under `build.needs_review`).
  It refuses to overwrite a "ready" or "published" edition (`--out` writes elsewhere).
- Frozen vs. seed editions: `lib/edition.ts` always recomputes changes, arrows and colors from the inputs; the
  validator fails an edition whose frozen fields disagree, so the file and the page cannot drift apart.
- `validate` implements spec 14.3 and exits 1 on any FAIL. Allow-listed banned-word matches (the "no forecast"
  disclaimer, the VIX definition) are listed with their reason in the report. Optional per-metric `max_age_days`
  and `typical_move` in `metrics.yaml` tune the freshness and large-move warnings.

## Going live (one-time setup, about 20 minutes)

The site is public, free and needs no login. Two free accounts make it live:

1. **Buttondown** (email list; free up to 100 subscribers): create a newsletter at buttondown.com, then in Settings:
   - turn on **double opt-in** (subscribers confirm by email);
   - set the confirmation redirect to `https://<your-site>/subscribe/confirmed`;
   - add your mailing address (required by U.S. anti-spam law; Buttondown puts it in every email footer);
   - copy the **API key** (Settings > API).
2. **Vercel** (hosting): import this GitHub repository at vercel.com (Hobby plan). Add environment variables
   `BUTTONDOWN_API_KEY` and `SITE_URL` (your Vercel address, e.g. `https://state-of-the-market.vercel.app`).
   Vercel deploys every push to `main`.
3. **GitHub** (automatic sending): in the repository's Settings > Secrets and variables > Actions, add secret
   `BUTTONDOWN_API_KEY` and variable `SITE_URL`.
4. Test: run Actions > "Monthly newsletter" > Run workflow with mode **dry-run**. It creates a draft in Buttondown
   (nothing is sent) so you can preview it and send a test to yourself.

## The monthly routine

1. Around the 25th, the new month's edition file (`data/editions/YYYY-MM.json`) is prepared with `"status": "draft"`.
   Drafts are not shown on the site. (Until Phase 3 is built, this step is done by hand.)
2. Review it on the Vercel preview. When happy, set `"status": "ready"` and merge to `main`.
3. That's the approval. Vercel publishes the page; the "Monthly newsletter" workflow waits until the page is live,
   emails every subscriber once, and records `newsletter_sent_at` in the file. It refuses to send the same edition twice.

Recommended send date: **the 28th of each month** (or the next weekday), mid-morning Central. By then the month's
key releases are out (jobs, CPI, permits, builder confidence, existing-home sales), leaving a few days after the
25th data pull for review.

Preview any month's email locally: `npm run newsletter -- 2026-11 --preview` writes `out/newsletter-2026-11.html`.

## Not yet documented

Setup for the data API keys (FRED, BLS) arrives with Phase 3.
