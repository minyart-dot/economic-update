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
| 5 | Monthly data PR workflow, PDF, `/sources` | Done: `monthly-update.yml`, `npm run pdf`, PDF + email publish flow in `newsletter.yml`, `/sources`; the workflows have not run on GitHub yet |
| 6 | VIX alert emails, admin form, analytics, OG images | Optional |

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static production build
npm run lint
npm run pdf -- 2026-11   # after npm run build: writes public/editions/2026-11.pdf
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
3. **GitHub** (monthly PR and automatic sending):
   - Settings > Secrets and variables > Actions: add secrets `BUTTONDOWN_API_KEY` and `FRED_API_KEY`
     (free at fred.stlouisfed.org > My Account > API Keys; optional `BLS_API_KEY` from bls.gov for higher rate limits),
     and variable `SITE_URL`.
   - Settings > Actions > General > Workflow permissions: turn on **Allow GitHub Actions to create and approve pull
     requests** (the monthly workflow opens the edition PR).
4. Test: run Actions > "Monthly newsletter" > Run workflow with mode **dry-run**. It renders the PDF (attached to the
   run, not committed) and creates a draft in Buttondown (nothing is sent) so you can preview it and send a test to
   yourself. Run Actions > "Monthly edition update" > Run workflow to try the monthly PR.

## The monthly routine

It starts by itself on the **25th of each month** (Actions > "Monthly edition update", 14:00 UTC; you can also run it by
hand and pick the month).

1. The workflow pulls the automated data (`npm run fetch`), creates `data/manual/YYYY-MM.yaml` pre-filled with last
   month's values marked `stale: true` (`npm run manual-template`), builds `data/editions/YYYY-MM.json` with
   `"status": "draft"` (`npm run build:edition -- YYYY-MM --draft`) and validates it (`npm run validate`).
   Drafts are not shown on the site.
2. It opens a pull request from branch `edition/YYYY-MM`, titled **"Edition YYYY-MM: review & publish"**, with a
   checklist of every manual field (label, source link, expected release timing) and the validation report. GitHub
   emails you about it. Running the workflow again updates the same PR; your edits on the branch are kept.
3. For each unticked field, click the source link, update the value and as-of date in `data/manual/YYYY-MM.yaml`,
   and set `stale: false`. GitHub's web editor is fine. Each save rebuilds the edition and refreshes the validation
   comment on the PR. (The build reports a failure until every required field is updated or set to
   `carry_forward: true` with a reason; the PR is opened anyway.) Edit the text in `data/editions/YYYY-MM.json`
   for accuracy and neutrality; saving only that file re-validates without rebuilding, so your text is kept.
4. Check the Vercel preview link on the PR (desktop and phone). A red check on the PR means validation failed.
5. When it looks right, set `"status": "ready"` in `data/editions/YYYY-MM.json` and merge. **Merging sends the email.**
6. That's the approval. Vercel publishes the page; the "Monthly newsletter" workflow waits until the page is live,
   renders the PDF from it and commits `public/editions/YYYY-MM.pdf`, emails every subscriber once (with a link
   to the PDF), and records `newsletter_sent_at` and `"status": "published"` in the file. It refuses to send the same
   edition twice. If the PDF fails, the email still goes out without the PDF link and the run shows a warning;
   re-run "Monthly newsletter" with mode **pdf-only** later.

Nothing is published without your merge. The workflows never force-push.

Recommended send date: **the 28th of each month** (or the next weekday), mid-morning Central. By then the month's
key releases are out (jobs, CPI, permits, builder confidence, existing-home sales), leaving a few days after the
25th data pull for review.

Preview any month's email locally: `npm run newsletter -- 2026-11 --preview` writes `out/newsletter-2026-11.html`.

## PDF edition

`npm run pdf -- YYYY-MM [--url BASE]` (`scripts/render-pdf.ts`) opens `BASE/archive/YYYY-MM` in headless Chromium
(Playwright), renders every lazy chart, and saves a US Letter PDF with the page's print stylesheet (each section
on a new page, nav and forms hidden, page numbers in the footer) to `public/editions/YYYY-MM.pdf`. Without
`--url` it starts the local production build (`npm run build` first) on a free port. When the file exists at build
time, the edition page shows a "Download PDF" link under the date (hidden in print), `/sources` links to it, and the
email includes it. It is also served at `/edition/YYYY-MM.pdf`.

Playwright is a dev dependency pinned to 1.63.0; locally it needs its Chromium (`npx playwright install chromium`
once). CI installs it with `npx playwright install --with-deps chromium`.

## Sources

`/sources` lists every source used in the latest edition, grouped by section and de-duplicated (the same list as the
References section at the end of each edition). It is linked from the footer.
