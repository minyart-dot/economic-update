# State of the Market

A free monthly economic and real estate briefing website for real estate investors (Texas-focused, plus national). Data only; not investment advice.

The full build spec is `STATE_OF_THE_MARKET_SPEC.md` (text) and `docs/State_of_the_Market_Website_Build_Spec.pdf` (source of truth).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Skeleton, design system, all 16 sections from static seed data | Done |
| 2 | Charts C1–C17 (Recharts), data-table toggles | Done |
| 3 | Data pipeline: FRED/BLS/Eurostat/ONS/Apartment List/Kastle/NY Fed fetchers, `build-edition`, `validate-edition`, manual template | Done; fetchers tested with fixtures only (needs `FRED_API_KEY` for live data) |
| 4 | Email signup (top of page + footer), Buttondown, monthly email, send workflow | Done; needs the accounts below to go live |
| — | Reader topic filter ("Choose topics", saved in the reader's browser) | Done |
| 5 | Monthly data PR workflow, PDF, `/sources` | Done: `monthly-update.yml`, `npm run pdf`, PDF + email publish flow in `newsletter.yml`, `/sources`; the workflows have not run on GitHub yet |
| 6 | VIX alert emails, link-preview images, analytics, AI drafting + audit | Done (optional features; each switches on with its key) |
| 6 | Admin form for monthly entry (`/admin`, password-protected) | Done; tested against a GitHub stand-in |
| — | Archive: site tabs, Editions dropdown, `/archive` with summaries; archived pages frozen as published | Done |
| Later | Accounts and personal metric alerts | Planned, see `docs/ROADMAP.md` |

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
- Kastle office occupancy (`office_occupancy_kastle`, scraped from the Back to Work Barometer page) and NY Fed
  household debt delinquency (`hh_debt_delinquent`, read from the quarterly Household Debt and Credit data
  workbook) are fetched on a best-effort basis by `npm run fetch`. Strict checks apply: one unambiguous figure,
  a plausible range, and a recent week or the expected quarter. If anything looks wrong, the last value is kept
  marked stale and the metric shows up in the manual template for you to enter (no value is ever guessed).
  Set `KASTLE_URL` if the page moves. Set `NYFED_HHDC_URL` to the current workbook
  link; by default it is derived as `.../householdcredit/data/xls/HHD_C_Report_<YYYY>Q<n>.xlsx`.

## AI drafting (optional)

Two optional helpers call the Claude API. Both only produce text for you to review; nothing they write is
published, and neither ever edits `data/editions/`.

```bash
npm run draft-summary -- 2026-12     # writes data/drafts/2026-12-summary.md
npm run audit -- 2026-12             # writes out/audit-2026-12.md (also reads the draft, if present)
```

- **Drafter** (`scripts/draft-summary.ts`, spec Appendix E): sends the neutrality rules and a compact copy of
  the edition (each metric's label, displayed value, period, year-ago value, direction, color, source, notes
  and footnotes) and drafts the month in brief, big picture, four themes (Housing, Building pipeline, Jobs,
  Household credit) with two bullets and an "Other side:" bullet each, and an email subject line. The draft is
  then checked with the validator's draft rules (every number must exist in the edition JSON, no banned
  words) plus the length and theme rules. If it fails, it is retried once with the problems listed; if it still
  fails, it is saved with a **VALIDATION FAILED** header listing them. Copy any text you keep into
  `data/editions/YYYY-MM.json` by hand.
- **Audit** (`scripts/audit-edition.ts`, spec 14.4): a separate call that reads the edition and the draft as a
  skeptical economist and lists findings (location, issue, suggested neutral rewrite): non-y/y comparisons,
  mixed sources, unlabeled periods, unsupported causal or "since" claims, and tone. It only reports.

In the monthly workflow both run after the build, only on the scheduled or manual run (not on your edits to
the branch). The draft is committed to the edition branch under `data/drafts/` and both appear in the PR
description. Either step failing never blocks the PR.

**Cost:** two calls a month (three if the draft needs its retry), each with roughly 10–20K tokens of input;
typically well under a dollar a month at current Claude API prices.

**Turn it on:** add the repository secret `ANTHROPIC_API_KEY` (Settings > Secrets and variables > Actions).
Optionally set the variable `ANTHROPIC_MODEL` to use a different Claude model (default in `scripts/lib/ai.ts`).
Locally, export `ANTHROPIC_API_KEY` in your shell before running the commands. **Turn it off:** delete the secret; the steps are skipped.

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

## Settings at a glance

Nothing here is required to view the site locally. Each feature switches itself on when its settings exist and skips
quietly (with a warning in the Actions log) when they don't. Never commit real values; `.env.example` lists them.

| Setting | Where | Needed for | Required? |
|---|---|---|---|
| `SITE_URL` | Vercel env + GitHub variable | Links in emails, sitemap, link previews | Yes, to go live |
| `BUTTONDOWN_API_KEY` | Vercel env + GitHub secret | Email signup, monthly email, volatility alerts | Yes, for email |
| `FRED_API_KEY` | GitHub secret | Monthly data fetch, volatility alerts | Yes, for automatic data |
| `APARTMENTLIST_CSV_URL` | GitHub variable | Rent data (Apartment List renames the file monthly) | Recommended |
| `NYFED_HHDC_URL` | GitHub variable | NY Fed household-debt workbook link, if the default quarterly name doesn't match | Optional |
| `KASTLE_URL` | GitHub variable | Kastle barometer page, if it moves | Optional |
| `BLS_API_KEY` | GitHub secret | Higher BLS rate limits | Optional |
| `ANTHROPIC_API_KEY` | GitHub secret | AI-drafted summary and audit in the monthly PR | Optional |
| `ANTHROPIC_MODEL` | GitHub variable | Override the AI model | Optional |
| `VIX_ALERT_THRESHOLD` | GitHub variable | Volatility alert level (default 30) | Optional |
| `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | Vercel env | `/admin` form login (secret: 32+ random characters) | Optional (form hidden without them) |
| `GITHUB_TOKEN`, `GITHUB_REPOSITORY` | Vercel env | `/admin` saves to the edition branch (fine-grained token, this repo only) | Optional (form hidden without them) |

Also in GitHub: Settings > Actions > General > Workflow permissions > **Allow GitHub Actions to create and approve pull
requests**.

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
   and set `stale: false`. GitHub's web editor is fine, or use the [admin form](#admin-form) at `/admin`. Each save rebuilds the edition and refreshes the validation
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

## Admin form

`/admin` is a password-protected page where you fill in the monthly hand-entered numbers instead of editing
`data/manual/YYYY-MM.yaml` on GitHub. It reads the file from the `edition/YYYY-MM` branch and saves it back there
through the GitHub API, so each save is a normal commit that re-runs the monthly workflow (rebuild, validation,
refreshed PR comment), exactly like an edit in GitHub's web editor.

### Setup (one time, about 10 minutes)

1. Create a fine-grained GitHub token: GitHub > Settings > Developer settings > Personal access tokens >
   Fine-grained tokens > Generate new token.
   - Repository access: **Only select repositories** > this repository.
   - Permissions: **Contents: Read and write**, **Pull requests: Read-only** (Metadata read-only is added
     automatically). Nothing else.
   - Pick an expiry (e.g. 1 year) and put a reminder in your calendar to renew it.
2. In Vercel > Project > Settings > Environment Variables (Production), add:
   - `ADMIN_PASSWORD`: a long password only you know.
   - `ADMIN_SESSION_SECRET`: a random string of at least 32 characters (e.g. `openssl rand -hex 32`).
   - `GITHUB_TOKEN`: the token from step 1.
   - `GITHUB_REPOSITORY`: `owner/repo` of this repository.
3. Redeploy. Open `https://<your site>/admin` and log in.

Until all four variables are set, `/admin` and `/api/admin/*` answer "page not found", so the form is invisible.

### The monthly flow with the form

1. On the 25th the workflow opens the PR "Edition YYYY-MM: review & publish" (unchanged).
2. Open `/admin`. It picks the newest `edition/YYYY-MM` branch (switch with the Edition menu) and lists every manual
   field grouped by area, with the last value, a link to the source, when it is usually released, and whether it is
   required. Fields that still need updating are marked; tick "Show only fields that still need updating" to hide
   the rest.
3. For each field, open the source, type the new value, the period it covers (e.g. `2026-11`, `2026-Q3`), the as-of
   date and the year-ago value and period. The short label, as-of and year-ago period are suggested from the period.
   The status switches to "Updated" as you type. No new release? Choose "No new release: carry forward" and say why.
   Plain numbers only (4.1, not 4.1%). Blank inputs keep the old value until a field is marked "Updated".
4. Press **Save changes**. Errors are shown next to the field. After a save you get links to the commit and the PR;
   the rebuild and validation take about 3 minutes and the validation report (also shown on `/admin`) updates.
5. If someone else (or you, in another tab or on GitHub) saved the file in the meantime, the form refuses to
   overwrite it and asks you to reload.
6. Then continue as usual: review the text and the Vercel preview, set `"status": "ready"`, merge.

### Security

- Only the server sees the password, the session secret and the GitHub token; nothing is `NEXT_PUBLIC_` and the
  browser only receives field values, the file version (sha) and public GitHub links.
- Login compares the password in constant time and is rate-limited (5 failed attempts per IP and 30 overall per 15
  minutes, per server instance). The session cookie is signed (HMAC-SHA256), lasts 12 hours, and is `httpOnly`,
  `Secure` and `SameSite=Strict`. Changing `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` logs everyone out. Saves also
  require a same-origin request.
- The code can only write `data/manual/YYYY-MM.yaml` on `edition/YYYY-MM` (same month): never `main`, never another
  file (`lib/admin/paths.ts`, tested). The token's scope (one repository, contents + read-only PRs) limits the damage
  if it ever leaked; revoke it on GitHub if in doubt.
- `/admin` is `noindex`, disallowed in `robots.txt` and not in the sitemap.
- Edits change only the lines of the fields you changed, so the file's comments stay. If the file was rewritten into
  a layout the editor does not recognise, it is saved in standard YAML layout with the header comment kept and the
  per-entry comments dropped (the form tells you).

Code: `app/admin`, `app/api/admin`, `lib/admin`, `components/admin`; tests in `tests/admin-*.test.ts` run against a
local GitHub stand-in (`tests/github-stand-in.ts`, `GITHUB_API_BASE` points the app at it).

## PDF edition

`npm run pdf -- YYYY-MM [--url BASE]` (`scripts/render-pdf.ts`) opens `BASE/archive/YYYY-MM` in headless Chromium
(Playwright), renders every lazy chart, and saves a US Letter PDF with the page's print stylesheet (each section
on a new page, nav and forms hidden, page numbers in the footer) to `public/editions/YYYY-MM.pdf`. Without
`--url` it starts the local production build (`npm run build` first) on a free port. When the file exists at build
time, the edition page shows a "Download PDF" link under the date (hidden in print), `/sources` links to it, and the
email includes it. It is also served at `/edition/YYYY-MM.pdf`.

Playwright is a dev dependency pinned to 1.63.0; locally it needs its Chromium (`npx playwright install chromium`
once). CI installs it with `npx playwright install --with-deps chromium`.

## Volatility alerts

Between editions, subscribers who ticked **"Also send me market alerts"** (Buttondown tag `alerts`) get a short email
when the VIX closes at or above **30**: "Market volatility alert: the VIX closed at {v} on {date}, above 30. This is
an automated data notice, not advice.", the alert level (high at 30, extreme at 40), the thresholds line and a link to
the gauges section. No forecasts or recommendations. **At most one alert every 5 trading days** (weekdays; market
holidays are counted as trading days). Other subscribers never get it.

- `.github/workflows/vix-alert.yml` runs weekdays at 21:30 UTC (4:30pm Central in winter, 5:30pm in summer). It
  reads FRED `VIXCLS`, or Cboe's daily CSV when FRED has not posted the day's close yet. After a send it commits
  the entry to `data/alerts.json` (`[skip ci]`), and the latest edition's gauges section shows "Last alert: {date}
  (VIX {v})". It skips with a warning until `BUTTONDOWN_API_KEY`, `FRED_API_KEY` and `SITE_URL` are set. Optional
  repository variable `VIX_ALERT_THRESHOLD` changes the level.
- Sending is restricted to the tag with Buttondown's email `filters` field. The script first saves a draft, checks
  that Buttondown kept the `alerts`-only audience, and only then sends; if not, it sends nothing and the run fails.
- **Test before relying on it:** Actions > "VIX alert" > Run workflow with mode **check** (prints the latest close
  and the decision) or **dry-run** (creates a Buttondown draft if the rule fires; nothing is sent). Locally:
  `npm run vix-alert` (check), `npm run vix-alert -- --dry-run --force` (always creates a draft marked `[TEST]`) and
  then open the draft in Buttondown and confirm its audience is only subscribers tagged `alerts`. Delete the test
  draft afterwards. `--date YYYY-MM-DD` and `--threshold N` are also accepted.

## Sources

`/sources` lists every source used in the latest edition, grouped by section and de-duplicated (the same list as the
References section at the end of each edition). It is linked from the footer.
