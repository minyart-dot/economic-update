# State of the Market: Website Build Specification (v1.0, November 2026)

> Plain-text extraction of `docs/State_of_the_Market_Website_Build_Spec.pdf`. The PDF is the source of truth; tables are flattened here. Seed data from Appendices B and C lives in `data/history/` and `data/config/sources.yaml`.

```text
   State of the Market: Website Build
   Specification
For: Claude Code (paste this whole document as the project brief)
Product: A free monthly economic and real estate briefing website for real estate investors (Texas-focused, plus
national), with email subscription and automatic monthly data updates.
Version: 1.0, November 2026 (based on the November 2026 PDF edition)

0. How to use this document (instructions for Claude Code)
    1. Read the whole document before writing code. Sections 1–4 cover product and design. Sections 5–9 cover
       every page and component. Sections 10–13 cover data, automation, email and hosting. Sections 14–17
       cover quality rules, the build plan and acceptance tests. The appendices hold the seed data, sources and
       copy.
    2. Build in the phases in Section 16. Finish each phase and run its acceptance checks before moving on.
    3. Never invent data. Every number on the site comes from data/ files that cite a source URL and an "as of"
       date. If a value is missing, show "—" with a tooltip saying "Not yet released" or "Not available". Never
       estimate a value.
    4. Neutrality is a hard requirement (Section 14). The site reports data and does not forecast or recommend.
    5. Ask the owner before choosing paid services. The defaults below run free.

1. Product summary
1.1 Goal
Give about 100 real estate investors one clear monthly picture of the economy and real estate markets. They
invest in houses (buy-and-hold), house flipping, new construction, land, rentals and multifamily, manufactured
homes, office, industrial and retail. The site serves two kinds of reader:
      Skimmers read the one-page "State of the Market" at the top and understand the month in about 60
      seconds.
      Divers scroll or click into detailed sections with 20-year charts, tables and source links.

1.2 Core features
    1. Public, free, no login. Anyone with the link can read it.
    2. One-page summary (home), plus detailed sections. The layouts are in Sections 6–8.
    3. Monthly archive. Every month's edition stays available at /archive/YYYY-MM .
    4. Email subscription with double opt-in and one-click unsubscribe. A monthly email goes out when a new
       edition is published.

                                                       1
    5. Automatic monthly data refresh for every source with an API. A checklist covers manual figures, and the
       owner reviews before anything is published.
    6. Market alert banner. The VIX alert and yield-curve inversion flag are set automatically from data.
    7. Downloadable PDF of each edition (optional, Phase 5).
    8. Every figure is clickable to its source. A full reference list sits at the bottom.

1.3 Audience and tone
          Audience: real estate investors, mostly laypeople in economics.
          Tone: formal, crisp, plain English. Use short sentences and 2–3 bullets per block. Explain every term the
          first time it appears, or in the glossary.
          No hype, no predictions, no advice. Include "Data only; not investment advice" in the footer.

2. Recommended tech stack (defaults; free tiers)
 Concern           Default                                              Why                                 Alternative
 Framework         Next.js 14+ (App Router) + TypeScript, static        Static pages are fast and free to   Astro
                   generation                                           host, and each edition is just
                                                                        data
 Styling           Tailwind CSS with design tokens from Section 4       Consistent and quick                CSS modules
 Charts            Recharts (SVG). Use one wrapper per chart type       Accessible, themeable, prints       Chart.js, visx
                                                                        well
 Fonts             Inter (Google Fonts via next/font )                  Matches the PDF                     —
 Hosting           Vercel (Hobby), auto-deploy from the GitHub main     Free; preview deploys for each      Netlify, Cloudflare
                   branch                                               PR                                  Pages
 Data store        Git-versioned JSON/YAML files in /data               No database needed. Full history, Supabase (only if you
                                                                        easy review in PRs                need it)
 Automation        GitHub Actions (monthly cron plus manual trigger)    Free for public and small private   Vercel Cron
                                                                        repos
 Email list and    Buttondown (free up to 100 subscribers; handles      Least code and compliant by         Resend + Supabase
 sending           double opt-in, unsubscribe and CAN-SPAM footer;      default                             (more code), Mailchimp
                   has an API)
 Optional AI       Anthropic API (Claude) to draft the monthly          Saves writing time                  Skip and write by hand
 drafting          summary text for human review
 PDF export        Playwright page.pdf() in GitHub Actions on a print   Reuses the site layout              —
                   stylesheet

Secrets (GitHub Actions secrets and Vercel env vars): FRED_API_KEY (free at fred.stlouisfed.org), BLS_API_KEY
(free, optional), BUTTONDOWN_API_KEY , ANTHROPIC_API_KEY (optional), SITE_URL .

                                                                   2
3. Information architecture
3.1 Routes
Route                                      Purpose
 /                                         Latest edition. The one-page State of the Market is at the top, followed by all detailed
                                           sections on one long page with a sticky section nav
 /archive                                  List of past editions (month, headline, VIX status chip)
 /archive/[yyyy-mm]                        A full past edition rendered from that month's data snapshot
 /methodology                              How comparisons, colors, arrows, alerts and correlations work, plus the glossary
 /sources                                  Full reference list for the latest edition, grouped by section
 /subscribe                                Email form (also embedded in the header and footer of every page)
 /subscribe/thanks ,                       Confirmation pages
 /subscribe/confirmed

 /unsubscribe                              Handled by Buttondown's link. Add a page explaining it
 /edition/[yyyy-mm].pdf                    Optional PDF download

3.2 Section order on the edition page (matches the PDF)
#    Section ID        Title                                            Subtitle
1    summary           State of the Market                              Monthly Brief for Real Estate Investors
2    key-              01 Key indicators                                Latest reading vs. a year ago and pre-pandemic 2019
     indicators

3    story             ◆ Reading the data together                      How the indicators relate and what has historically moved
                                                                        together. No forecast is made
4    twenty-year       02 The 20-year view                              Long history so one recent year does not skew the picture
5    jobs-ai           03 Jobs and AI                                   Announced layoffs and the share companies attribute to AI
6    credit            04 Household credit                              Late payments and defaults rather than total debt
7    rates             05 Rates, markets and AI investment              Borrowing costs and the AI capital spending cycle
8    gauges            5b Market risk gauges                            Yield curve, stock-market volatility (VIX) and the U.S. dollar
9    housing           06 Housing, building permits and                 Permits signal construction several months ahead
                       manufactured homes
10   inventory         6b Months of inventory                           How long current supply would take to sell at today's pace
11   cre               07 Commercial real estate                        Office, industrial and retail vacancy and office occupancy
12   tx-metros         08 Texas metros                                  Dallas–Fort Worth, Houston, Austin and San Antonio
13   texas             09 Texas statewide                               Statewide distress, permits and manufactured housing
14   europe            10 Europe                                        Labor and business conditions abroad
15   watch             11 What to watch                                 Reference levels and upcoming releases
16   references        12 References                                    Every source used in this edition; each is a clickable link

                                                                    3
4. Design system
4.1 Look and feel
Clean, crisp and polished, without being fancy. Use a white background, a navy header band, and teal and
orange accents. Keep plenty of whitespace and a card-based layout. It must look good on phones, because
about half of readers will use mobile. It must also print cleanly to US Letter.

4.2 Color tokens
Token             Hex                               Use
 navy              #14213D                          Header band, headings, section number circles, table headers, primary
                                                    bars
 teal              #1F7A8C                          Primary data series, links, accents
 orange            #E07A2E                          Secondary series, year-ago markers, warm accents
 purple            #8A6FB0                          Fourth series (San Antonio)
 grey              #B8BEC6                          Context bars (e.g., total job cuts)
 dark              #3A3F47                          Chart text
 ink               #1E2430                          Body text
 muted             #6A7380                          Captions, labels
 light             #E9EDF1                          Grid lines, recession shading
 panel             #F4F6F8                          Callouts and summary panels
 border            #E1E6EC                          Card borders
 good              #1E8E3E (bg #E3F4E7 , text       Favorable change
                   #1E7A36 )

 bad               #C62828 (bg #FBE5E5 , text       Unfavorable change
                   #B22222 )

 neutral           #1E2430 (bg #E6E8EB )            Flat or mixed
 alert-amber       #B26A00                          VIX elevated
 alert-red         #C62828                          VIX high
 alert-            #8B0000                          VIX extreme
extreme

The header band's bottom edge has a 5px stripe: teal for the first 60%, orange for the remaining 40%.

4.3 Typography
         Font: Inter (400/600/700).
         H1 (header title): 40px desktop / 30px mobile, 700.
         Eyebrow: 11px, uppercase, letter-spacing 0.18em, #9FB4CC .
         H2 (section): 22px, 700, navy.
         Section kicker: 12px, muted.
         Body: 15px desktop / 15px mobile, line-height 1.45.
         Tile value: 26px, 700, navy. Card value: 22px. Labels: 11px uppercase, muted, letter-spacing 0.06em.
         Captions and source notes: 11px muted.

                                                           4
4.4 Core components (build these as reusable React components)
   1. HeaderBand . Shows the eyebrow "MONTHLY BRIEF FOR REAL ESTATE INVESTORS", the title "State of the
      Market", and a subtitle listing the coverage ("U.S. and Texas · Houses, flips, new construction, land,
      rentals, manufactured homes, office, industrial"). Edition month and "Data as of " sit top right. A subscribe
      button sits in the header.
   2. SectionHeader . A navy circle with the section number (e.g., "01", "5b", "◆"), the H2 title and the kicker. It
      has a 1.5px navy bottom rule.
   3. StatTile . Shows a label, value, ChangeArrow , "y/y" tag and a sub-line (period and year-ago value). Its top
      border is 3px, colored teal, orange or navy by "tone" (decorative only).
   4. AssetCard (used in the investment-type grid). Shows the asset name (bold, with a bottom rule), metric label
      (uppercase muted), value with ChangeArrow and "y/y", and 2–3 bullet facts with inline source links.
   5. ChangeArrow . Shape shows direction (▲ higher, ▼ lower, ▶ flat). Color shows how the change is generally
      read (green favorable, red unfavorable, black flat or mixed). See Section 5. Always paired with a small grey
      "y/y" tag. If no like-for-like year-ago value exists, render no arrow.
   6. ChangePill (in tables). A rounded pill reading "▲ Higher", "▼ Lower" or "▶ Unchanged", colored good,
      bad or neutral. Never wraps.
   7. AlertBanner . The VIX alert (Section 9). There's a compact one-line variant for the summary and a full
      variant for the gauges section.
   8. Callout . A panel background with a 3px teal left border, used for "The month in brief", "Big picture" and
      "How to read it".
   9. DataTable . Navy header row, zebra rows, group labels in teal uppercase. Mobile shows horizontal scroll
      with a sticky first column.
  10. Figure . Chart title (bold, navy), chart, and a caption with the source in muted 11px.
  11. SourceLink . An inline link with a dotted teal underline that opens in a new tab. Every key figure in bullets is
      a SourceLink .
  12. NoteBox . Small muted text with a left grey border, used for methodology notes under tables.
  13. NextMonthStrip . A navy bar listing the upcoming release dates.
  14. SubscribeForm . An email field and a "Subscribe free" button, with the microcopy "One email a month.
      Unsubscribe anytime." It posts to Buttondown.
  15. SectionNav . A sticky left rail on desktop and a horizontal scroll chip bar on mobile, with links to every
      section anchor.
  16. Footer . "State of the Market · Real Estate Investor Brief · ", page-style footer text, "Data only; not
      investment advice", a subscribe form and a link to the methodology page.

4.5 Charts: general rules
      Recharts SVG with responsive containers. Height is about 240px for full-width charts and 200px for half-
      width.
      Remove the top and right axes. Light grid lines ( #E9EDF1 ). Axis text 11px dark.
      Label key points directly (peak, low, latest) instead of relying on legends alone. Always show the latest
      value.
      Give every chart a caption with the source and any data caveats.
      Tooltips show the exact value, period and source.
      Use only colors from Section 4.2. Never use color alone to carry meaning (labels too).
      Charts must render in print CSS.

                                                         5
5. Comparison, arrow, color and neutrality rules (critical)
5.1 Comparison basis
      Every arrow compares the latest reading with the same period one year earlier (y/y): October vs.
      October, Q3 vs. Q3, Jan–Sep vs. Jan–Sep, H1 vs. H1, full year vs. prior full year.
      Show a small "y/y" tag next to every arrow.
      Other comparisons must be spelled out in words: m/m (vs. the prior month), YTD (year to date vs. the
      same months last year), annual pace / SAAR (a monthly figure, seasonally adjusted and scaled to a year),
      vs. 2019 (pre-pandemic reference), 20-year average (2006–2025), peak/low (highest or lowest since the
      year named).
      If the year-ago value is missing (e.g., October 2025 unemployment was not collected because of the
      government shutdown), use the nearest month, mark it with an asterisk and add a footnote ("*Oct 2025
      unemployment not collected (shutdown); Sep 2025 used").
      Never compare figures from different sources or methods as if they were the same series. For example,
      CBRE and Moody's office vacancy. Report each source's own trend.
      Never pair figures from different periods in one statement without labeling each period (e.g., "Oct median
      price … Q3 supply").

5.2 Direction
direction = sign(latest − year_ago)     with a flat band: a change smaller than the metric's flat_threshold (default
1% relative, or 0.05 points for rates) is "flat" (▶).

5.3 Color = how the change is generally read for the broad economy
Each metric has a polarity in its config:
       higher_is_good (e.g., job openings)
      lower_is_good (e.g., unemployment, claims, charge-offs, delinquency, CPI, mortgage rate, junk spread,
      vacancy rates, bankruptcies, foreclosures)
      mixed (always black): home prices, building permits, months of inventory, manufactured home output, land
      prices, rents, AI capex, Fed funds, dollar index, yield curve level. These help some investors and hurt
      others.
color = good   if the direction matches the polarity, bad if it is opposite, neutral if flat or the metric is mixed.
Write this legend in the summary note: "Arrows show direction vs. a year ago (▲ ▼ ▶). Color shows how the
change is generally read: green favorable, red unfavorable, black flat or mixed (e.g., higher prices help owners
but hurt buyers). Data only; no forecast."

5.4 Neutrality rules (enforced in copy review and by the optional AI drafting prompt)
      Describe; don't predict. No "will", "expect", "likely", "headed for", "bubble", "crash" or "opportunity".
      No causal claims unless a cited source states them. Prefer "while" or "alongside" over "because" or
      "driving".
      Every theme in the narrative gets an "Other side:" bullet with the strongest counterpoint from the data.
      Summary groups use "Improving or steady / Worsening or elevated / Mixed", never "Healthy/Warning".
      Correlations always carry the disclaimer: "Correlation shows two series moved together, not that one
      caused the other."

                                                             6
6. Section-by-section layout spec (edition page)
All values below are the November 2026 edition values and become the seed data (Appendix A/B). Each item
lists the metric, value, comparison, source, frequency and automation status (AUTO = API; SEMI = scripted
download or parse; MANUAL = owner enters it monthly).

6.1 Summary: "State of the Market" (the one-page read)
Layout, top to bottom:
    1. HeaderBand (Section 4.4).
    2. AlertBanner (compact), e.g., "⚠ VIX ELEVATED · 24.52 (Nov 18), above 20. Alert levels: 20 elevated · 30
       high · 40 extreme." It links to #gauges .
    3. Four headline StatTiles in one row (2×2 on mobile): | Label | Value | Sub-line | Arrow / color | |---|---|---|-
       --| | 30-yr mortgage | 7.28% | Nov 19 · year ago 6.26% | ▲ red | | Unemployment | 4.1% | Oct · Sep 2025:
       4.4%* | ▼ green | | Inflation (CPI) | 3.7% | Sep · core 2.6% · year ago 3.0% | ▲ red | | Builder confidence |
       25 | Nov · lowest since 2012 | ▼ red |
    4. Callout "The month in brief." One paragraph of 4–5 sentences, neutral. November text: "Unemployment is
       low at 4.1%; mortgage rates near 7.3% coincide with the slowest home sales since 2010 and supply of 5.1
       months. Builder confidence, flipping returns and permits are down, nationally and in Texas. Apartment
       rents are flat nationally and lower in Texas metros. Office and industrial vacancy are off their peaks.
       Household credit is split: card stress is easing, auto and overall delinquency are rising, and foreclosures
       are up from low levels."
    5. "By investment type": a 3×3 grid of AssetCards (1 column on mobile, 2 on tablet): | Card | Metric label |
       Value | Arrow | Bullets | |---|---|---|---|---| | Houses · buy & hold | Median existing-home price | $416,700
       | ▲ black | +0.4% vs. Oct 2025; sales 3.75M annual pace, lowest since 2010 · 5.1 months of supply,
       highest since 2015 · Texas: Oct median $325,000, down ~3%; Q3 supply 5.5 months | | House flipping |
       Typical gross ROI (Q2; ATTOM calls it ROI) | 21.5% | ▼ red | 27.6% in Q2 2025; gross profit $60,526 (vs.
       $71,000) · Flips 6.2% of all sales vs. 7.3% in Q2 2025 | | New construction | Builder confidence (Nov) | 25 |
       ▼ red | 38 a year ago; 46% of builders cut prices, avg 6% · Single-family permits 772,000 pace, −12.9%
       y/y | | Land · Texas rural | Median price per acre (Q2, 4-qtr avg) | $5,218 | ▲ black | +3.3% vs. Q2 2025;
       number of sales up · Acres sold and dollar volume down · DFW-area MLS land listings: 21.9 months supply
       | | Rentals · multifamily | U.S. median rent (Oct) | $1,384 | ▶ black | +0.1% y/y; Texas metros −1.2% to
       −3.8% · U.S. occupancy 95.4% (Q3) | | Manufactured homes | Production, Jan–Aug 2026 | 58,885 | ▼
       black | −5.1% vs. Jan–Aug 2025; 2025 total ~103,000, flat · Avg. new price $129,400 (Jun) vs. $84,400
       (Jun 2019) | | Office | National vacancy (Q3, CBRE) | 18.2% | ▼ green | −0.6 pts y/y, 5th straight quarterly
       drop; badge-ins ~56% of 2019 · Dallas–FW 24.6% (CBRE); Houston 25.6% (Newmark) | | Industrial & retail
       | Industrial vacancy (Q3, C&W) | 6.8% | (no arrow: no like-for-like year-ago value) | Off 7.0% late-2025
       peak; DFW 7.8% vs. 8.9% y/y (CBRE) · Pipeline +23% y/y; retail vacancy 4.3%, malls 8.2% | | Distressed &
       foreclosure | Foreclosure filings, H1 2026 vs. H1 2025 | +21% | ▲ red | Starts +18%, repossessions +33%;
       Aug 2026 filings +13% y/y · Texas led states in H1 starts; far below 2010 |
    6. NextMonthStrip: "Next month: Fed Dec 8–9 · CPI Dec 10 · Permits Dec 17 · Builder confidence mid-Dec ·
       Q4 office/industrial early Jan".
    7. NoteBox "Comparisons." Uses the legend text from Section 5, plus the unemployment footnote.

                                                          7
6.2 01 Key indicators (table)
Columns: Area | Indicator | Latest | Year ago | 2019 | Change vs. year ago (ChangePill). The Area label shows
only on the first row of each group.

Area             Indicator                      Latest           Year ago            2019          Change     Polarity
Labor            Unemployment rate              4.1% (Oct)       4.4% (Sep 2025)*    3.6% (Dec)    Lower      lower_is_good
                 New jobless claims (weekly)    203,000          222,000             ~218,000      Lower      lower_is_good
                                                                                     avg
                 Continuing claims              1.763M           1.949M              ~1.68M avg    Lower      lower_is_good
                 Job openings                   7.5M (Sep)       7.2M                6.7M (Dec)    Higher     higher_is_good
Prices & rates   Inflation (CPI, yearly)        3.7% (Sep)       3.0%                2.3% (Dec)    Higher     lower_is_good
                 Fed funds rate                 3.75–4.00%       3.75–4.00%          1.50–1.75%    Unchanged mixed
                 30-year mortgage rate          7.28% (Nov 19)   6.26%               3.94% avg     Higher     lower_is_good
                 Junk-bond spread               3.52 pts         3.17 pts            3.60 pts      Higher     lower_is_good
Housing          Existing home sales (annual    3.75M (Oct)      4.11M (rev.)        5.46M (Oct)   Lower      higher_is_good
                 pace)
                 Median existing-home price     $416,700         $414,900            $270,900      Higher     mixed
                 Months of inventory, U.S.      5.1 (Oct)        4.4                 —             Higher     mixed
                 Building permits, U.S.         1.295M (Oct)     1.418M (Oct 2025,   1.386M        Lower      mixed
                 (annual pace)                                   rev.)               (year)
                 Building permits, Texas        147,854          163,525             199,600       Lower      mixed
                 (Jan–Sep)                                                           (year)
                 Manufactured home              58,885 (Jan–     62,053              94,633        Lower      mixed
                 production                     Aug)                                 (year)
Commercial       Office vacancy (CBRE)          18.2% (Q3)       18.8%               —             Lower      lower_is_good
                 Industrial vacancy (C&W)       6.8% (Q3)        n/a (peak 7.0%, late —            —          lower_is_good
                                                                 2025)
                 Office occupancy (Kastle, % ~56%                —                   100%          —          mixed
                 of 2019)                                                            baseline
Household        Bankruptcy filings, Jan–Oct    523,747          476,201             774,940       Higher     lower_is_good
credit                                                                               (year)
                 Card charge-off rate           3.82% (Q2)       4.19%               3.78% (Q4)    Lower      lower_is_good
                 Household debt delinquent      4.96% (Q3)       4.48%               —             Higher     lower_is_good
                 (NY Fed)
                 Subprime auto 60+ days late 6.27%               6.46%               5.93% (Aug) Lower        lower_is_good
                 (Fitch)                     (restated)
Sentiment & AI   Consumer sentiment             51.0 (Nov,       51.0                ~96 avg       Unchanged higher_is_good
                                                prelim.)
                 Big Tech AI capital spending   >$720B (2026     ~$410B (2025)       n/a           Higher     mixed
                                                plan)

NoteBox under the table: "Arrows compare the latest reading with the same period one year earlier (y/y); the
'2019' column is a separate pre-pandemic reference and is not used for the arrow. Color: green = generally read
as favorable for the broad economy, red = generally read as unfavorable, black = flat or mixed. *October 2025
unemployment was not collected (government shutdown). Bankruptcies 2025–26 from Epiq; 2019 from U.S.
Courts. Texas permits are not seasonally adjusted."

                                                                 8
6.3 ◆ Reading the data together (narrative and correlations)
   1. Callout "Big picture." "Jobs are still solid by historical standards, but borrowing costs are high and
      existing-home sales are at a 16-year low. Builders are pulling back on new permits, especially in Texas.
      Household credit is split: credit card losses are easing, while auto and overall delinquency, bankruptcies
      and foreclosures are rising from low levels."
   2. A two-column grid of four themes, each an H3 plus 3 bullets (the last is "Other side:"):
              1 · Housing: high rates, low turnover. Mortgage rates (7.28%) are well above the 20-year average
              (4.8%); existing sales are at the slowest pace since 2010 · Prices are flat nationally (+0.4%) and
              slightly lower in Texas (statewide median down about 3% in October) · Other side: Texas listings
              rose 2.8% in Q3, giving buyers more choice.
              2 · Building pipeline: slowing. Builder confidence 25, the lowest since April 2012; 46% of builders
              cut prices in November · U.S. permits in 2025 were 18% below the 2021 high (October pace 25%
              below); Texas 2025 was 20% below its 2022 peak; Houston and Austin about −14% this year ·
              Other side: Texas metros are still working through a large apartment supply wave, so rents are
              falling now.
              3 · Jobs: steady, softer at the edges. Unemployment 4.1% and weekly claims 203,000 are low by
              20-year standards · Average job search is 27.1 weeks, recent-graduate unemployment is 5.6%, and
              AI-cited layoffs rose in 2026 before falling to 1,265 in October · Other side: total announced layoffs
              are down 44% (Jan–Oct vs. Jan–Oct 2025).
              4 · Household credit: mixed. Improving: card charge-offs (3.82%) are below a year ago; new card
              serious delinquencies at the lowest since Q1 2024 · Worsening: total delinquency 4.96%, highest
              since 2016; new auto 90+ day delinquencies highest since 2010; bankruptcies up each year since
              2022; foreclosure filings +21% (H1) · Scale: foreclosures are about one-eighth of the 2010 peak.
   3. Chart C15: U.S. building permits (bars, left axis) vs. unemployment rate (line, right axis), 2006–2025.
   4. Correlation table. Computed by the pipeline from the annual series (Section 11.6): | Relationship (annual,
      2006–2025) | Correlation | Plain terms | |---|---|---| | Unemployment vs. foreclosures | +0.75 | Higher
      unemployment years usually had more foreclosures | | Unemployment vs. building permits | −0.78 |
      Permits tend to be low when unemployment is high | | Permit change vs. unemployment change the
      following year | −0.52 | Permits fell 68% from 2006 to 2009 before unemployment peaked in 2010 | |
      Unemployment vs. card charge-offs | +0.62 | Card losses rise and fall with jobs | | Texas permits vs. U.S.
      permits | +0.95 | Texas building closely tracks the national cycle | NoteBox: "Correlation runs from −1 to
      +1; it shows that two series moved together, not that one caused the other. Only 20 annual data points;
      excludes 2020–21 pandemic years (+0.52 with them). The next-year relationship uses 18 pairs of years."

6.4 02 The 20-year view
     C1 Unemployment and 30-yr mortgage rate, annual averages, 2006–2025 (two lines, teal and orange).
     Shade 2008–09 (recession) and 2020 (pandemic) bands labeled. Label 9.6% (2010) and 2.96% (2021).
     Bullets: Unemployment peaked at 9.6% (2010); 2025 averaged 4.3% · Mortgage rates bottomed at a
     2.96% annual average (2021); 2023–2025 (6.6–6.8%) are slightly above 2006–07 levels (6.3–6.4%).
     C2 Foreclosure filings (properties) and bankruptcy filings, 2006–2025, in millions (navy and teal lines).
     Label 2.87M peak (2010), latest 0.37M and 0.57M.
     Bullets: Foreclosures peaked at 2.87M properties (2010); 2025 was 367,460, about one-eighth of the peak
     · Bankruptcies peaked at 1.59M (2010); 2025 was 574,314, up each year since the 2022 low; foreclosures
     rose 14% in 2025.
     Caption caveats: RealtyTrac/ATTOM year-end reports (2014, 2021 and 2024 derived from reported %
     changes); U.S. Courts (2007–08 are fiscal years).

                                                         9
6.5 03 Jobs and AI
     C3 Announced job cuts per year (grey bars) with AI-cited cuts overlaid (teal), 2016–2026 YTD. Label totals
     above the bars and "AI x.x%" below them.
     C4 AI-cited job cuts by month, Jan 2024 to latest (bars; current year teal, earlier years grey). Label the
     peak (38.6K May 2026), Oct 2025 (31.0K) and the latest month. Annotate the combined-only periods
     ("Mar–Jul 2024: 800 total", "Jan–Jun 2025: 75 total"). The trend must be visible monthly, because the
     owner wants early warning.
     Bullets: AI-cited cuts 12,742 in 2024 and 54,836 in 2025; 2026 peaked at 38,579 in May and was 1,265 in
     October · AI was the top stated reason every month from March to July 2026, then below 10% of monthly
     cuts in August–October · Unemployment 4.1% (Oct) with 165,000 jobs added, vs. a prior 12-month average
     of 48,000; recent-graduate unemployment 5.6% (Q2, NY Fed); average job search 27.1 weeks.

6.6 04 Household credit
     A two-column row: C5 credit card charge-off rate, Q4 each year 2006–2025 (area line; label 10.5% 2009
     and the latest), and C6 subprime auto 60+ days late (Fitch) bars. Caption: "Fitch restated the index in July
     2026; earlier bars are pre-restatement and not directly comparable."
     Bullets: Card charge-offs 3.82% (Q2 2026) vs. 4.19% a year earlier: near 2019 (3.78%), well below the
     2009 peak (10.54%) · Seriously late (90+ days): student loans 10.9%, autos 5.66%, the highest since the
     series began in 2003 · 4.96% of all household debt is in some stage of delinquency, up from 4.48% a year
     ago, the highest since 2016; card balances 90+ days late 12.9% (2010 peak 13.74%).

6.7 05 Rates, markets and AI investment
     Three StatTiles: 10-year Treasury 4.94% (Nov 20 · Oct 5 close 5.31% was a 24-yr high) · Fed funds 3.75–
     4.00% (same as a year ago; cut late 2025, hiked Sep 2026; ▶ black) · Big Tech capex >$720B (2026
     plans vs. ~$410B in 2025; ▲ black).
     Bullets: Inflation 3.7% (Sep) is energy-led: energy +20.4% y/y, while core is 2.6%. No October annual rate
     was published (2025 shutdown); October rose 0.4% on the month · Futures implied a >90% chance of a
     0.25-pt hike at the Dec 8–9 meeting (as of Nov 17) · Big Tech 2026 plans: Amazon ~$220B, Alphabet
     $195–205B, Meta $135–145B (~$245B total in 2024) · S&P 500 hit its lowest close since late July on Nov
     17; junk-bond spread 3.52 pts, below the ~5 pts seen in past stress periods.

6.8 5b Market risk gauges
     AlertBanner (full).
     Three StatTiles:
            Yield curve (10-yr − 2-yr): +0.30 pts (Nov 17 · year ago +0.55 · 20-yr avg +1.00), ▼ black
            VIX volatility index: 24.52 (Nov 18 · 2026 avg 18.2 · 20-yr avg 19.4), no arrow unless a verified year-
            ago close exists
            Dollar index (DXY): ~103.7 (Nov 19 · year ago 100.2, +3.5%), ▲ black
     C17 is three small panels of annual averages, 2006 to 2026 YTD:
            yield curve bars (red when negative, teal when positive, zero line)
            VIX line with an amber 20–30 band and a red 30+ band
            Fed broad trade-weighted dollar line
            Caption notes that the broad index (26 currencies) differs from the six-currency DXY.
     Bullets: the yield-curve bullet (not inverted; inverted for most of 2022–2024; inversions have preceded
     past recessions) · the VIX bullet (24.52 on Nov 18; 70% spike to 28.18 on Nov 5; 2026 avg 18.2 vs. 32.7 in

                                                       10
     2008 and 29.3 in 2020) · the dollar bullet (19-month high of 103.97 on Nov 19; +3.5% y/y; much of the rise
     reflects a weaker euro; the Fed broad index rose ~2% in 2026 through Nov 6).
     An explainer table with the columns Gauge | What it measures | Commonly watched levels | Why investors
     watch it, and rows for Yield curve, VIX and Dollar.
     NoteBox "VIX alert rule" (Section 9).

6.9 06 Housing, building permits and manufactured homes
     C7 Housing units authorized by building permits, 2006–2025: two side-by-side bar panels, U.S. (navy,
     thousands) and Texas (teal, thousands). Label the U.S. low of 583K (2009, with a leader line so it doesn't
     overlap) and the Texas peak of 261K (2022).
     Bullets: U.S. permits at a 1.295M annual pace in October, the lowest since May 2020; single-family
     772,000, down 12.9% · Texas 147,854 units Jan–Sep 2026, 9.6% below the same months of 2025; the
     state peaked at 261,230 in 2022 vs. 82,104 in 2009 · U.S. 2025 total 1.43M, below the 2021 high (1.74M)
     and above the 2009 low (583,000).
     Bullets: Existing home sales 3.75M pace (Oct), lowest since 2010; pending-sales index 63.0, a record low;
     median price $416,700 (+0.4% y/y) · Mortgage delinquency 4.42%, +0.43 pts vs. a year ago (Q3, MBA);
     FHA foreclosure rate 1.89%, highest since 2017.
     C8 Manufactured home shipments, 2006–2025 (grey bars, latest teal; label 49.7K 2009 and the latest).
     Bullet: Shipments ~103,000 in 2025, double the 2009–10 low; 2026 production −5.1% Jan–Aug (MHARR);
     average new price $129,400 (Jun 2026) vs. $84,400 (Jun 2019).

6.10 6b Months of inventory
     Callout "How to read it." "Months of inventory = listings for sale ÷ sales per month. A higher number
     means more choice for buyers and more competition among sellers; a lower number means the reverse.
     Benchmarks differ: NAHB cites 4.5–6 months as balanced nationally; Texas sources have cited 3–4
     months (Texas Real Estate Research Center) or 4–5 months (Texas Realtors)."
     C16 Horizontal bars, latest months of inventory with orange "|" markers for a year ago, and a shaded 4.5–6
     band labeled "commonly cited 'balanced' range". Rows: U.S. (Oct) 5.1 [4.4] · Texas (Q3) 5.5 [5.4] · Dallas–
     FW (Oct) 4.6 [4.4] · Houston (Oct) 5.5 [5.1] · Austin (Sep) 5.4 [5.5] · San Antonio (Sep) 5.95 [5.9]. Put value
     labels to the right of whichever is larger, bar end or marker.
     A table with the columns Market | Property type | Months of inventory | Year ago | Median price | Sales
     y/y:
            United States · Existing homes · 5.1 (Oct) · 4.4 · $416,700 (+0.4%) · −8.8%
            Texas statewide · Homes · 5.5 (Q3) · 5.4 · $325,000 Oct (−~3%) · −11% (Oct)
            Dallas–Fort Worth · Single-family · 4.6 (Oct) · 4.4 · $379,000 (−1.6%) · −15.6%
            Houston · Single-family · 5.5 (Oct) · 5.1 · $320,000 (−3%) · −14.9%
            Austin metro · Homes · 5.4 (Sep) · 5.5 · $404,802 Oct (−6.9%) · −11.4% (Oct)
            San Antonio · Homes · 5.95 (Sep) · 5.9 · ~$299,000 Oct (flat) · −5% (Oct)
            DFW-area MLS (NTREIS) · Land (195 sales) · 21.9 (Sep) · — · $148,000 (+6%) · −26%
            DFW-area MLS (NTREIS) · Commercial sale (51 sales) · 30.2 (Sep) · — · $558,000 (+27%) · −6%
     NoteBox: land and commercial turn over far more slowly than homes, so compare them with their own
     history. Statewide land months of inventory is not published. Medians shift with the mix of properties sold,
     and land and commercial rest on small samples.
     Bullets: U.S. supply 5.1 months, the highest since November 2015, as sales fell to a 16-year low · Houston
     supply at a 14-year high (5.5 vs. 5.1 months a year ago); Dallas–FW has the least supply of the four big
     metros at 4.6 months · Austin and San Antonio are roughly unchanged from a year ago, near 5.5–6
     months.

                                                       11
6.11 07 Commercial real estate
     Three StatTiles:
            Office occupancy ~56% (Kastle 10-city avg vs. pre-2020; Tuesday peak ~67%)
            Office vacancy 18.2% (CBRE Q3; −0.6 pts y/y; firms range 17.2–21.5%), ▼ green
            Retail vacancy 4.3% (Colliers Q3; malls 8.2%)
     A two-column row: C9 national office vacancy 2019–2025 (Moody's annual, navy line; a dashed orange
     line marks the prior record of 19.3% from 1986 and 1991; label 16.8% and 20.7%), and C10 vacancy by
     sector, Q3 2026 (bars: Office 18.2 navy, Malls 8.2 orange, Shopping centers 5.9 orange, Industrial 6.8
     teal).
     Bullets:
            Office: Moody's measure rose from 16.8% (2019) to a record 20.7% (2025). Other firms measure
            differently but show the same direction now: CBRE 18.2% (−0.6 pts y/y), Yardi 17.8% (−0.8 pts y/y).
            CBRE prime space 11.9%; completions −76% y/y. Badge-ins ~56% of 2019.
            Industrial: vacancy 6.8% (C&W), down from a 7.0% peak in late 2025 and the lowest since end-
            2024; deliveries −13% YTD, but space under construction +23% y/y.
            Retail: among the tightest sectors at 4.3% (Colliers); shopping centers 5.9% vs. ~7% pre-pandemic;
            malls 8.2%.
     A two-column row: C11 Texas office vacancy, Sep 2026 (Yardi; horizontal bars: U.S. 17.8, Dallas–FW 18.6,
     Houston 23.6, Austin 24.5), plus bullets:
            DFW office 18.6% (Yardi), down 3.6 pts in a year; CBRE's broader measure 24.6%
            Houston office 25.6% by Newmark's measure (23.6% Yardi), flat; leasing at its weakest since 2009
            DFW industrial 7.8% (CBRE), down from 8.9% a year ago; DFW leads the U.S. in industrial space
            under construction

6.12 08 Texas metros
     A table with the columns Metro | Permits Jan–Sep 2026 | vs. 2025 (pill) | Permits 2019 | Peak year |
     Median rent (Oct) | Rent y/y | Office vacancy:
            Dallas–FW · 47,666 · −9.3% · 62,948 · 76,789 (2022) · $1,413 · −1.3% · 18.6%
            Houston · 42,916 · −14.3% · 61,900 · 75,474 (2022) · $1,330 · −1.9% · 23.6%
            Austin · 17,598 · −14.7% · 31,542 · 50,297 (2021) · $1,296 · −1.2% · 24.5%
            San Antonio · 8,723 · +4.3% · 13,662 · 24,444 (2022) · $1,140 · −3.8% · —
            U.S. reference · — · — · — · — · $1,384 · +0.1% · 17.8%
     NoteBox with the sources (Census via FRED metro permits, NSA; Apartment List Rent Index; Yardi Matrix).
     C12 Housing units authorized by permits by metro, 2006–2025 (4 lines: DFW navy, Houston teal, Austin
     orange, San Antonio purple; end labels offset so they don't overlap).
     A two-column row: C13 permit change Jan–Sep 2026 vs. 2025 (horizontal bars, with Texas in grey) and
     C14 median apartment rent and y/y change, Oct 2026 (bars with "$X / ±y%" labels).
     Bullets:
            Permits: Houston (−14.3%) and Austin (−14.7%) fell the most; San Antonio rose 4.3% from a low
            2025 base; Austin's 2025 total was 45% below its 2021 peak
            Rents: all four metros are below a year ago while the U.S. is +0.1%; San Antonio has the steepest
            decline of any large U.S. metro; about 32% of properties nationally advertise a month or more free
            Home prices (Oct): statewide $325,000 (−~3%); Austin metro $404,802 (−6.9%, partly a shift
            toward cheaper sales); Houston $320,000 (−3%); DFW $379,000 (−1.6%); San Antonio ~$299,000,
            flat

                                                     12
6.13 09 Texas statewide
      Three StatTiles: Foreclosure starts 20,739 (Jan–Jun 2026, +17%; most of any state; ▲ red) · Personal
      bankruptcies 33,979 (2025, +19.9%; ▲ red) · Permits Jan–Sep 147,854 (−9.6% vs. 2025; ▼ black).
      Bullets: Texas recorded the most foreclosure starts of any state, 37,215 in 2025 · Foreclosures complete in
      155 days on average in Texas vs. 563 nationally · New manufactured home sales titled: 11,976 in 2026
      through September.

6.14 10 Europe
      Bullets: Euro area unemployment 6.5% (Sep), up from 6.3%; EU youth unemployment 15.5%; UK 4.6%,
      down from 4.9% · EU business bankruptcies at their highest level since early 2019 (Q2 2026) · Morgan
      Stanley estimates up to 20% of European bank jobs could be cut over five years due to AI, mostly through
      attrition.

6.15 11 What to watch
      A two-column grid:
            Reference levels table (Indicator | Reference level | Today): Sahm rule 0.50 pts | ~0.0 · Yield curve
            (10y–2y) below zero | +0.30 · VIX 20 elevated / 30 high | 24.5 · Inflation (CPI) Fed target 2% | 3.7% ·
            Junk-bond spread >~5 pts in stress | 3.52 · Continuing claims ~1.9M a year ago | 1.763M · Office
            occupancy 100% = 2019 | ~56%.
            Release calendar table (Date | Release): Thursdays weekly jobless claims · Early Dec Challenger
            layoffs and BLS jobs · Dec 8–9 Federal Reserve meeting · Dec 10 November CPI · Dec 17 November
            permits and starts · Mid-Dec ATTOM foreclosures · Early Jan Q4 office/industrial reports.
      NoteBox "Comparisons and terms" (the glossary from Appendix D).

6.16 12 References
A two-column list grouped by section, each item a clickable title. The pipeline builds it automatically from every
source_url used in the edition, de-duplicated. Add a final group, "Additional sources linked in the text".

7. Chart catalog (IDs used above)
 ID   Title               Type           Data key (Appendix B)                                Notes
 C1   Unemployment and    2 lines +      unemployment_rate_annual_avg_pct ,                   Recession/pandemic
      30-yr mortgage      shaded bands   mortgage30_annual_avg_pct                            shading
      rate, 2006–2025
 C2   Foreclosures and    2 lines        foreclosure_properties_with_filings ,                Bankruptcies start 2007
      bankruptcies,       (millions)     bankruptcy_filings_total
      2006–2025
 C3   Announced job cuts overlaid bars   challenger_job_cuts                                  "AI x%" labels
      with AI-cited
 C4   AI-cited cuts by    bars           ai_cited_cuts_monthly                                Null months render
      month                                                                                   empty, plus an
                                                                                              annotation
 C5   Card charge-off     area line      card_chargeoff_q4_pct
      rate (Q4)

                                                          13
ID    Title               Type             Data key (Appendix B)                                Notes
C6    Subprime auto 60+   bars             subprime_auto_60plus_fitch                           Restatement caveat
      (Fitch)
C7    Permits U.S. and    2 bar panels     us_permits_thousands_nsa , texas_permits_units_nsa
      Texas
C8    Manufactured home bars               manufactured_home_shipments                          Mixed MHI/MHARR
      shipments                                                                                 caveat
C9    Office vacancy,     line +           office_vacancy_moodys_annual                         19.3% prior record
      Moody's             reference line
C10 Vacancy by sector     bars             edition values
    Q3
C11   Texas office        horizontal       edition values
      vacancy (Yardi)     bars
C12 Texas metro           4 lines          texas_metro_permits_units_nsa
    permits 2006–2025
C13 Metro permit          horizontal     edition values
    change YTD            diverging bars
C14 Metro rents           bars             edition values
C15 Permits vs.           bars + line,     us_permits_thousands_nsa ,
    unemployment          dual axis        unemployment_rate_annual_avg_pct

C16 Months of inventory horizontal         edition values
                        bars + year-
                        ago markers
                        + band
C17 Market risk gauges    3 small panels   yield_curve_10y2y_annual_avg_2006_2026ytd ,
                                           vix_annual_avg_2006_2026ytd ,
                                           broad_dollar_annual_avg_2006_2025

8. Responsive and print behavior
      Breakpoints: mobile under 640px (1 column, tiles 2×2, tables scroll horizontally with a sticky first column,
      charts full width at 220px tall); tablet 640–1024px (2 columns); desktop over 1024px (max content width
      1100px, sticky section nav on the left).
      Print stylesheet: US Letter, 0.6in margins. Each section starts on a new page, matching the PDF edition.
      Hide the nav and subscribe forms. Show the footer with the page number. Links stay blue-underlined.
      Accessibility: WCAG AA contrast. Charts get aria-label summaries and a "View data table" toggle. Arrows
      include screen-reader text (e.g., "up versus a year ago, unfavorable").
      Performance: Lighthouse score of 90+ on mobile. Static generation; no client data fetching for the edition.

9. Market alert logic
      VIX alert banner, computed from the latest VIX close ( metrics.vix.latest ): | VIX | Level | Color | Text | |---
      |---|---|---| | < 20 | NORMAL | good green | "● VIX NORMAL · {v} ({date}), below 20." | | 20–29.99 |
      ELEVATED | amber #B26A00 | "⚠ VIX ELEVATED · {v} ({date}), above 20, the level commonly watched as a
      sign of heightened uncertainty." | | 30–39.99 | HIGH ALERT | red #C62828 | "⚠ VIX HIGH ALERT · … above
      30, a level historically associated with market stress." | | ≥ 40 | EXTREME | dark red #8B0000 | "⚠ VIX

                                                            14
       EXTREME · … historically seen only in acute crises (2008, 2020)." | Always append: "Thresholds: 20
       elevated · 30 high · 40 extreme."
       Yield-curve inversion flag. If the 10y−2y spread is below 0, append " · Yield curve inverted (10-yr below
       2-yr)" to the banner.
       Between-edition alerts (Phase 6, optional). A daily GitHub Action at 4:30 pm CT on weekdays fetches
       VIX (FRED VIXCLS , or Cboe's daily CSV for same-day data). If VIX closes at or above 30 (configurable) and
       no alert was sent in the last 5 trading days, it emails subscribers who opted into alerts. In Buttondown, this
       is a separate tag alerts . The email is short and neutral: "Market volatility alert: the VIX closed at {v} on
       {date}, above 30. This is an automated data notice, not advice." Log alerts to data/alerts.json , and show
       "Last alert" on the gauges section.

10. Data model
10.1 Folder layout

 /data
   /config
     metrics.yaml           # every metric: id, label, unit, polarity, flat_threshold, source, automation, fre
 quency
     sections.yaml          # section order, titles, kickers
     sources.yaml           # source registry (name, url, notes)
   /history                 # long series used by charts (Appendix B seed); appended by pipeline
     us_annual.json
     texas_annual.json
     challenger.json
     gauges.json
   /editions
     2026-11.json           # frozen snapshot of everything shown in the November edition
     2026-12.json
   /manual
     2026-12.yaml           # owner-entered values for the month (template auto-created)
   /drafts
     2026-12-summary.md     # AI or human drafted narrative text, reviewed in PR
   alerts.json
 /scripts
   fetch/fred.ts fetch/bls.ts fetch/eurostat.ts fetch/apartmentlist.ts fetch/nyfed.ts fetch/kastle.ts
   build-edition.ts         # merges auto + manual + history -> editions/YYYY-MM.json, computes y/y, arrows, c
 olors, correlations, alert
   validate-edition.ts      # quality gates (Section 14.3)
   draft-summary.ts         # optional Claude API draft with neutrality prompt
   make-manual-template.ts # writes data/manual/YYYY-MM.yaml with last month's values and blanks
   send-newsletter.ts       # Buttondown API: create & send email for edition
   render-pdf.ts            # Playwright PDF of /archive/YYYY-MM
 /app ...                    # Next.js routes
 /components ...             # Section 4.4 components
 /.github/workflows
   monthly-update.yml publish.yml vix-alert.yml (optional)

10.2 Metric record (in each edition JSON)

 {
     "id": "mortgage30",
     "label": "30-year mortgage rate",
     "value": 7.28, "display": "7.28%", "period": "2026-11-19", "period_label": "Nov 19",
     "year_ago": 6.26, "year_ago_period": "2025-11-20",

                                                         15
   "change_abs": 1.02, "change_pct": 16.3,
   "direction": "up", "polarity": "lower_is_good", "color": "bad",
   "comparison_basis": "y/y",
   "ref_2019": "3.94% avg",
   "source_name": "Freddie Mac PMMS via FRED", "source_url": "https://fred.stlouisfed.org/series/MORTGAGE30U
 S",
   "as_of": "2026-11-19", "automation": "AUTO", "footnote": null, "notes": null
 }

Rules: direction and color are computed in build-edition.ts , never typed by hand. display formatting follows
the metric's unit config. If year_ago is null, direction is null and no arrow renders.

10.3 Edition JSON top level
{ "edition": "2026-11", "published_at", "data_as_of", "headline_summary", "month_in_brief", "big_picture",
"themes":[...], "asset_cards":[...], "tiles":{...}, "tables":{...}, "charts":{...}, "correlations":[...],
"alert":{...}, "next_month":[...], "sections":{ "<id>": { "bullets":[{ "text", "links":[{ "phrase","url" }] }] }
}, "references":[...] }

Inline links: bullets store plain text plus a links array of {phrase, url} . The renderer wraps the first occurrence of
each phrase in a SourceLink .

11. Data sources and automation map
11.1 Automated through APIs (AUTO)
FRED API ( https://api.stlouisfed.org/fred/series/observations?series_id=X&api_key=…&file_type=json ): | Metric |
FRED series | Frequency | Notes | |---|---|---|---| | Unemployment rate | UNRATE | Monthly | Annual avg for
history | | Initial claims / continuing claims | ICSA / CCSA | Weekly | Use the latest week and the same week a year
ago | | Job openings | JTSJOL | Monthly | | | Avg. weeks unemployed | UEMPMEAN | Monthly | "27.1 weeks" | | CPI
headline / core / energy | CPIAUCSL / CPILFESL / CPIENGSL | Monthly | y/y = 12-month % change, computed | | Fed
funds target range | DFEDTARL , DFEDTARU | Daily | | | 30-yr mortgage | MORTGAGE30US | Weekly | | | 10-yr Treasury |
DGS10 | Daily | | | Yield curve 10y−2y | T10Y2Y | Daily | Inversion flag | | VIX | VIXCLS | Daily | Alert banner | | Broad
dollar | DTWEXBGS | Daily | DXY itself is not on FRED (see the manual table) | | Junk-bond spread | BAMLH0A0HYM2 |
Daily | | | Consumer sentiment | UMCSENT | Monthly | Prelim mid-month | | Building permits (SAAR / NSA / 1-unit) |
PERMIT / PERMITNSA / PERMIT1 | Monthly | | | Housing starts | HOUST | Monthly | optional | | New-home months'
supply | MSACSR | Monthly | optional | | Texas permits | TXBPPRIV | Monthly | NSA, sum YTD | | Metro permits |
DALL148BPPRIV , HOUS448BPPRIV , AUST448BPPRIV , SANA748BPPRIV | Monthly | NSA | | Card charge-off rate | CORCCACBS |
Quarterly | | | Card delinquency rate | DRCCLACBS | Quarterly | optional | | Avg. new manufactured home price |
SPTNSAUS | Monthly | Compare same month a year earlier and same month 2019 |

Other APIs: | Metric | Source / method | Status | |---|---|---| | Euro-area and EU unemployment, youth | Eurostat
API dataset une_rt_m | AUTO | | UK unemployment | ONS API (series MGSX) | AUTO | | Apartment rents (U.S. and
metros) | Apartment List Rent Estimates CSV (public download on their research data page) | SEMI (scripted
download, parse metros) | | NY Fed household debt (total delinquency, 90+ by type, transitions) | NY Fed
Household Debt and Credit Report data Excel (quarterly) | SEMI | | Kastle office occupancy | Kastle "Back to
Work Barometer" page | SEMI (scrape weekly number; fall back to manual) |

                                                           16
11.2 Manual monthly entry (MANUAL), with value, source and as-of date in data/manual/YYYY-MM.yaml
 Metric(s)                                    Source                                                            Release timing
 Existing-home sales, median price,           NAR monthly release (and NAHB "Eye on Housing" summary)           ~3rd week
 inventory, months' supply
 Pending home sales index                     NAR                                                               ~end of month
 Builder confidence (HMI), % cutting prices, NAHB/Wells Fargo HMI                                               ~mid-month
 avg cut
 Announced job cuts and AI-cited cuts         Challenger, Gray & Christmas                                      first week
 (monthly and YTD)
 Recent-graduate unemployment                 NY Fed College Labor Market                                       quarterly
 Foreclosure filings, starts, REO (U.S. and   ATTOM monthly, midyear and year-end reports                       mid-month
 Texas)
 Bankruptcy filings (monthly/YTD)             Epiq/ABI; annual from U.S. Courts                                 first week
 Texas personal bankruptcies                  LendingTree / U.S. Courts district tables                         annual
 Subprime auto 60+                            Fitch auto ABS index (via press coverage)                         monthly
 Mortgage delinquency, FHA foreclosure        MBA National Delinquency Survey                                   quarterly
 rate
 House flipping (rate, gross profit, ROI)     ATTOM Home Flipping Report                                        quarterly
 Manufactured home production/shipments       MHARR monthly; MHI annual                                         monthly
 Texas manufactured home titles               Texas Manufactured Housing Association                            monthly
 Texas rural land price per acre              Texas Real Estate Research Center (TRERC) rural land report       quarterly
 Texas statewide median price, months of      Texas Realtors / TRERC; TPR coverage                              monthly/quarterly
 inventory, sales
 Metro months of inventory, median price,     MetroTex/NTREIS (DFW), HAR (Houston), Unlock MLS (Austin),        monthly
 sales                                        SABOR (San Antonio)
 DFW-area land and commercial months of       NTREIS Monthly MLS Summary PDF                                    monthly
 inventory
 Apartment occupancy (U.S.)                   RealPage                                                          quarterly
 Office vacancy                               CBRE (national, DFW), Yardi Matrix (national + metros monthly),   monthly/quarterly
                                              Moody's (annual history), Newmark (Houston)
 Industrial vacancy, pipeline, deliveries     Cushman & Wakefield MarketBeat; CBRE DFW                          quarterly
 Retail vacancy                               Colliers; C&W shopping centers                                    quarterly
 Big Tech AI capex                            Company guidance (earnings)                                       quarterly
 DXY (six-currency dollar index)              ICE close via market news (e.g., FXStreet, RTT)                   monthly
                                                                                                                snapshot
 Fed hike/cut odds                            CME FedWatch / Trading Economics                                  snapshot
 EU business bankruptcies                     Eurostat quarterly news release                                   quarterly
 Release calendar dates                       BLS, Fed, Census schedules                                        monthly

Generate the manual template automatically each month, pre-filled with last month's values (marked stale:
true ), source URLs and the expected release date. The build fails if any required: true field is still stale, unless
the owner sets carry_forward: true with a reason. The site then shows that value with its original "as of" date.

                                                                  17
11.3 Data freshness
Each metric has max_age_days (e.g., daily 7, weekly 14, monthly 45, quarterly 120). The validator warns when data
is older than this, and the page shows "as of" dates on every tile.

11.4 Revisions
On each run, re-pull the year-ago value from the API instead of reusing old snapshots. For example, Census
revised October 2025 permits from 1.412M to 1.418M. Mark revised values "(rev.)".

11.5 History append
At year-end, the pipeline appends the new annual average or total to each /history series. Charts always show
the last 20 complete years plus the current YTD where noted.

11.6 Computed analytics (in build-edition.ts )
      y/y changes, direction, color (Section 5).
      20-year averages (2006–2025, rolled forward each year).
      Peak, low and "highest/lowest since" checks: scan history to generate phrases like "lowest since May
      2020". Only write a "since" phrase if the pipeline computed it or a cited source states it.
      Correlations, all Pearson on annual series:
              unemployment vs. foreclosures
              unemployment vs. U.S. permits
              % change in permits (t) vs. change in unemployment (t+1)
              unemployment vs. card charge-offs, both with and without 2020–21
              Texas vs. U.S. permits
              Round to 2 decimals and report n.
      Alert level (Section 9).

12. Monthly update automation (GitHub Actions)
12.1 monthly-update.yml
      Triggers: schedule: cron "0 14 25 * *" (the 25th of each month, 9am CT; most monthly releases are out by
      then) and workflow_dispatch .
      Steps:
          1. Check out the repo, set up Node.
          2. Run all scripts/fetch/* jobs and write raw pulls to data/raw/YYYY-MM/ (git-ignored, or kept for an
             audit trail).
          3. make-manual-template.ts : create data/manual/YYYY-MM.yaml if missing.
          4. build-edition.ts --draft to produce data/editions/YYYY-MM.json .
          5. Optionally, draft-summary.ts calls the Claude API with the neutrality system prompt (Appendix E)
             and the computed numbers. It writes data/drafts/YYYY-MM-summary.md with the month in brief, big
             picture, theme bullets and Other-side bullets. It must cite only numbers present in the edition JSON.
             The validator rejects any number not found there.
          6. validate-edition.ts , then post the results as a PR comment.
          7. Open a pull request titled "Edition YYYY-MM: review & publish" containing:

                                                       18
                    the auto-filled data
                    the manual template with a checklist of every manual field (source link plus expected release
                    date)
                    the drafted summary
                    the validation report
                    Vercel's preview deploy URL
      The owner fills in the manual YAML (directly in GitHub's web editor is fine), edits the text, re-runs the build
      (the push triggers the workflow on the PR) and merges when happy.

12.2 publish.yml
      Trigger: push to main that changes data/editions/** , with the edition's "status": "ready" .
      Steps:
          1. Vercel deploys automatically from main .
          2. Wait for the deployment URL to return 200.
          3. Run render-pdf.ts to create the PDF and commit it to /public/editions/YYYY-MM.pdf , or upload it as a
             release asset.
          4. Run send-newsletter.ts , which calls the Buttondown API to create and send the email (Section 13.3).
             It is idempotent: it records newsletter_sent_at in the edition JSON and refuses to send twice.
          5. Set the edition "status": "published" .

12.3 vix-alert.yml (optional, Phase 6)
Runs at cron "30 21 * * 1-5" (4:30pm CT, weekdays), applies the Section 9 logic and sends to the alerts tag
only.

12.4 Failure handling
If any fetch fails, keep last month's value marked stale, flag it in the PR and never block the whole run. Retry each
API call twice with backoff. Never publish automatically without a merged PR (a human approves every edition).

13. Email subscription and newsletter
13.1 Subscribe flow (Buttondown default)
       SubscribeForm  posts to Buttondown's embed endpoint ( https://buttondown.com/api/emails/embed-
      subscribe/<username>  ), or to a Next.js API route that calls the Buttondown API with the server-side key
      (preferred: lets you add tags and avoids exposing the username).
      Fields: email (required), plus an optional checkbox "Also send me market alerts when volatility spikes"
      (adds tag alerts ).
      Double opt-in is on. Show /subscribe/thanks ("Check your inbox to confirm"). Buttondown's confirmation
      link lands on /subscribe/confirmed .
      Unsubscribe is one click via Buttondown's footer link. A /unsubscribe page explains this. Include the
      owner's mailing address in the footer (CAN-SPAM requirement; Buttondown setting).
      Anti-spam: a honeypot field and basic rate limit on the API route.
      Privacy: a short privacy note under the form ("We only use your email to send this brief. No sharing.
      Unsubscribe anytime.").

                                                         19
13.2 Alternative: Resend + Supabase
Use this only if the owner needs more than 100 free subscribers and won't pay for Buttondown:
      a subscribers table ( email , status , token , created_at , confirmed_at , tags )
      confirm and unsubscribe tokens
      Resend for sending, a React Email template, and a List-Unsubscribe header

13.3 Monthly email content (generated from the edition JSON)
      Subject: "State of the Market, {Month YYYY}: {one-line neutral headline}". Example: "State of the Market,
      November 2026: Home sales at 16-year low; VIX elevated".
      Preheader: the first sentence of "The month in brief".
      Body (simple HTML, mobile friendly, 600px):
          1. Navy header with the title and month.
          2. VIX alert line (colored).
          3. Four headline numbers in a 2×2 table, with arrows (use the text symbols ▲▼▶ in color; no images
             needed).
          4. "The month in brief" paragraph.
          5. "By investment type": 9 lines, each "Asset: value arrow · one fact".
          6. A "Read the full brief" button linking to /archive/YYYY-MM , plus a link to the PDF.
          7. The next-month release dates.
          8. Footer: "Data only; not investment advice." Unsubscribe link, mailing address.
      A plain-text version is auto-generated.

14. Quality, neutrality and audit rules
14.1 Content rules
      Every number shows its period and links to its source.
      Every arrow is y/y, with the y/y tag. Missing year-ago values mean no arrow.
      Never mix sources in one trend statement. Label each source.
      Never pair different periods without labels.
      Use "lowest/highest since" only when computed or cited.
      Round consistently: percentages to 1 decimal (2 for rates under 10% where the source gives 2), counts
      with thousands separators, money as $X,XXX or $X.XXM/B.

14.2 Known caveats to display (keep them in the notes)
      Oct 2025 unemployment not collected (shutdown). No October 2026 CPI 12-month rate published.
      Fitch subprime auto index restated July 2026; earlier values not comparable.
      Foreclosure years 2014, 2021 and 2024 derived from reported % changes. Bankruptcies 2007–08 are
      fiscal years.
      Manufactured home history mixes MHI shipments (2006–24) and MHARR production (2025+).
      Office vacancy levels differ by firm (Moody's, CBRE, Yardi, Newmark, C&W). Compare within a firm only.
      The 20-year dollar chart uses the Fed broad index, not DXY.
      NTREIS land and commercial figures cover the DFW area only and rest on small samples.

                                                          20
      Austin median changes partly reflect sales mix.
      Correlations use 20 annual points (18 for the lagged one).

14.3 validate-edition.ts checks (fail = block publish; warn = PR comment)
      FAIL: any displayed number lacks source_url or as_of .
      FAIL: an arrow is shown where comparison_basis != "y/y" or year_ago is null.
      FAIL: a draft summary contains a number not present in the edition JSON (regex for numbers and
      percentages, tolerance ±0.05).
      FAIL: the draft contains banned forecast words ( will , expect , forecast , likely , poised , bubble , crash ,
      opportunity , should buy , should sell ), excluding quoted source titles.
      WARN: data older than max_age_days . WARN: a metric changed more than 3× its typical monthly move
      (possible entry error). WARN: a broken link (HEAD request is not 2xx/3xx).
      WARN: the same metric shows different values in two places.
      Output a Markdown report for the PR.

14.4 Optional independent AI audit step
After validation, a second Claude call (separate from the drafter) reviews the edition JSON and draft text as a
skeptical economist. It checks basis, mixed sources, unsupported claims and tone, and posts its findings as a PR
comment. A human decides what to change.

15. Admin experience (owner, about 30–60 minutes a month)
    1. Around the 25th, receive the GitHub PR notification.
    2. Open data/manual/YYYY-MM.yaml . For each stale field, click the source link, update the value and as-of date,
       and save. GitHub's web editor is fine.
    3. Read the drafted summary and edit it for accuracy and neutrality.
    4. Check the Vercel preview link on desktop and phone.
    5. Merge. The site updates, the PDF is generated and subscribers get the email automatically.
    6. Optional (later): a password-protected /admin form that writes the manual YAML through the GitHub API,
       so the owner never touches files.

16. Build plan (phases for Claude Code)
Phase 1: Skeleton and design system (static seed).
      Set up Next.js, TypeScript, Tailwind and Inter. Build the tokens from Section 4.2.
      Build every component in Section 4.4.
      Load data/editions/2026-11.json (create it from Section 6 and Appendix A/B) and render the full edition
      page with all sections in order.
      Acceptance: the page visually matches the PDF layout, is responsive, and has the sticky nav and anchor
      links working.
Phase 2: Charts.
      Implement C1–C17 with Recharts from the Appendix B history and edition values.

                                                          21
      Acceptance: labels don't overlap at 375px or 1280px; captions present; data-table toggles work.
Phase 3: Data pipeline.
      Build metrics.yaml , the FRED, BLS and Eurostat fetchers, build-edition.ts (computations, arrows, colors,
      correlations, alert), validate-edition.ts and make-manual-template.ts .
      Acceptance: running npm run build:edition -- 2026-11 reproduces the November values for the AUTO
      metrics within revision tolerance. The correlations match Section 6.3.
Phase 4: Subscribe and email.
      Buttondown integration, the API route, the confirmation pages, the email template and send-newsletter.ts
      (with a dry-run flag that sends to the owner only).
      Acceptance: subscribe → confirm → receive test email → unsubscribe works end to end.
Phase 5: Automation and archive.
      The GitHub workflows ( monthly-update.yml , publish.yml ), archive routes, PDF rendering and the
      methodology and sources pages.
      Acceptance: a manual workflow_dispatch for a test month opens a PR with data, checklist, draft and
      validation report. Merging publishes, renders the PDF and sends the email (dry-run).
Phase 6 (optional): Alerts and polish.
      The daily VIX alert workflow, an admin form, analytics (privacy-friendly, e.g., Plausible or Vercel Analytics)
      and OG images for link previews.

17. Acceptance checklist (whole project)
      [ ] All 16 sections render in order, with the exact content structure in Section 6.
      [ ] Every number has a period, source link and as-of date. The references list is complete and de-
      duplicated.
      [ ] Arrows are y/y only, with the y/y tag. Colors follow polarity. Missing year-ago means no arrow.
      [ ] The VIX banner changes level correctly (test 15, 22, 33, 45). The inversion flag shows when the spread
      is below 0.
      [ ] Mobile layout works (375px), print looks like the PDF, Lighthouse mobile is 90+, WCAG AA is met.
      [ ] Subscribe with double opt-in, unsubscribe works, the email renders in Gmail, Outlook and Apple Mail.
      [ ] The monthly workflow opens a PR and nothing publishes without a merge. The newsletter sends once
      per edition.
      [ ] The validator blocks numbers without sources, forecast language and non-y/y arrows.
      [ ] Archive pages for each past month stay unchanged after new editions.
      [ ] The README documents setup (keys, Buttondown, Vercel), the monthly owner steps and how to add a
      metric.

Appendix A: November 2026 edition values (seed for data/editions/2026-11.json )
All values in Section 6 are the November 2026 edition values. Additional values used on the page:

                                                        22
        VIX latest 24.52 (Nov 18, 2026); Nov 5 close 28.18 (+69.7% in a day); 2026 YTD average 18.16; 20-year
        average 19.45.
        Yield curve 10y−2y +0.30 (Nov 17, 2026); a year ago +0.55; 2026 low +0.22; 20-year average +1.00.
        DXY ~103.65 (Nov 19, 2026), intraday high 103.97 (19-month high); a year ago 100.18 (Nov 21, 2025 close).
        10-year Treasury 4.94% (Nov 20); 24-year closing high 5.31% (Oct 5).
        CPI: headline 3.7%, core 2.6%, energy +20.4% (Sep 2026, y/y); October +0.4% m/m; no October y/y
        published.
        Unemployment 4.1% (Oct 2026); +165,000 jobs; prior 12-month avg 48,000; average duration 27.1 weeks;
        long-term unemployed 2.0M (27.6% of jobless).
        AI-cited cuts 2026 YTD 121,401 of 617,189 total (~19.7%); total cuts −44% vs. Jan–Oct 2025.
        NY Fed Q3 2026: total delinquency 4.96% (year ago 4.48%), highest since Q1 2016; auto serious
        transition 3.02% (highest since Q1 2010); auto 90+ balance share 5.66% (record since 2003); card serious
        transition 6.87% (lowest since Q1 2024); student loans 90+ 10.9%; card 90+ balance share 12.9%.
        ATTOM H1 2026: 227,548 properties with filings (+21%); starts 164,566 (+18%); REO +33%; August 2026
        filings +13% y/y. Texas H1 starts 20,739 (+17%); 2025 Texas starts 37,215; Texas foreclosure timeline 155
        days vs. 563 national.
        NAHB HMI 25 (Nov 2026), 38 a year ago; 46% cut prices; avg cut 6%; 68% used incentives.
        ATTOM flipping Q2 2026: rate 6.2% (7.3% a year ago); gross profit $60,526 ($71,000); gross ROI 21.5%
        (27.6%).
        CBRE office Q3 2026: 18.2% (−60 bps y/y, 5th straight quarterly decline); prime 11.9% (−250 bps);
        completions −76% y/y; asking rent +3.1% y/y. Yardi national office 17.8% Sep 2026 (−80 bps).
        Cushman & Wakefield industrial Q3 2026: 6.8%; late-2025 peak 7.0%; pipeline 324 msf (+23% y/y); YTD
        completions 185 msf (−13%).
        Fed funds 3.75–4.00%; futures >90% odds of a 25 bp hike at Dec 8–9 (as of Nov 17).

Appendix B: Long history seed ( data/history/*.json )
 {
     "years_2006_2025": [
      2006,
      2007,
      2008,
      2009,
      2010,
      2011,
      2012,
      2013,
      2014,
      2015,
      2016,
      2017,
      2018,
      2019,
      2020,
      2021,
      2022,
      2023,
      2024,
      2025
     ],
     "unemployment_rate_annual_avg_pct": [
      4.61,
      4.62,

                                                        23
 5.8,
 9.28,
 9.61,
 8.93,
 8.08,
 7.36,
 6.16,
 5.28,
 4.88,
 4.36,
 3.89,
 3.68,
 8.1,
 5.35,
 3.65,
 3.63,
 4.03,
 4.26
],
"mortgage30_annual_avg_pct": [
 6.41,
 6.34,
 6.03,
 5.04,
 4.69,
 4.45,
 3.66,
 3.98,
 4.17,
 3.85,
 3.65,
 3.99,
 4.54,
 3.94,
 3.11,
 2.96,
 5.34,
 6.81,
 6.72,
 6.6
],
"card_chargeoff_q4_pct": [
 3.7,
 4.32,
 6.53,
 10.54,
 7.91,
 4.63,
 3.84,
 3.37,
 3.01,
 2.94,
 3.49,
 3.7,
 3.67,
 3.78,
 2.68,
 1.63,
 2.51,
 4.18,
 4.57,
 4.09
],

                                 24
"foreclosure_properties_with_filings": {
 "2006": 717522,
 "2007": 1285873,
 "2008": 2330483,
 "2009": 2824674,
 "2010": 2871891,
 "2011": 1887777,
 "2012": 1836634,
 "2013": 1361795,
 "2014": 1117085,
 "2015": 1083572,
 "2016": 933045,
 "2017": 676535,
 "2018": 624753,
 "2019": 493066,
 "2020": 214323,
 "2021": 150808,
 "2022": 324237,
 "2023": 357062,
 "2024": 322333,
 "2025": 367460
},
"bankruptcy_filings_total": {
 "2007": 801269,
 "2008": 1042993,
 "2009": 1473675,
 "2010": 1593081,
 "2011": 1410653,
 "2012": 1221091,
 "2013": 1071932,
 "2014": 936795,
 "2015": 844495,
 "2016": 794960,
 "2017": 789020,
 "2018": 773418,
 "2019": 774940,
 "2020": 544463,
 "2021": 413616,
 "2022": 387721,
 "2023": 452990,
 "2024": 517308,
 "2025": 574314
},
"us_permits_thousands_nsa": [
 1838.9,
 1398.2,
 905.4,
 583.0,
 604.8,
 624.1,
 829.7,
 990.9,
 1052.1,
 1182.5,
 1206.6,
 1282.1,
 1328.8,
 1386.2,
 1471.3,
 1737.1,
 1680.4,
 1511.2,
 1477.8,

                                           25
 1431.8
],
"texas_permits_units_nsa": [
 211863,
 172455,
 125916,
 82104,
 83840,
 93807,
 129840,
 146554,
 165456,
 171003,
 160272,
 171645,
 186891,
 199600,
 221568,
 252610,
 261230,
 220532,
 225126,
 208359
],
"texas_metro_permits_units_nsa": {
 "Dallas\u2013FW": [
  56434,
  40975,
  33180,
  20026,
  19222,
  24502,
  32536,
  37229,
  40645,
  52004,
  52954,
  61384,
  61862,
  62948,
  58946,
  72032,
  76789,
  62552,
  70339,
  65528
 ],
 "Houston": [
  68725,
  61528,
  42226,
  26855,
  27216,
  31019,
  43436,
  50991,
  63263,
  57262,
  45799,
  44879,
  57113,
  61900,
  67608,

                                     26
  68519,
  75474,
  67376,
  65155,
  64991
 ],
 "Austin": [
  25935,
  19879,
  14144,
  8768,
  7570,
  10244,
  18438,
  21403,
  22784,
  21870,
  22138,
  25898,
  28778,
  31542,
  40627,
  50297,
  42536,
  36300,
  33530,
  27438
 ],
 "San Antonio": [
  19480,
  13513,
  9994,
  5962,
  6071,
  6168,
  7873,
  8922,
  8722,
  8383,
  9257,
  10810,
  10552,
  13662,
  16633,
  19624,
  24444,
  16357,
  14582,
  10087
 ]
},
"manufactured_home_shipments": [
 117373,
 95752,
 81457,
 49683,
 50056,
 51618,
 54881,
 60228,
 64334,
 70544,
 81169,

                                   27
 92891,
 96540,
 94633,
 94401,
 105775,
 112865,
 89178,
 103288,
 102738
],
"challenger_job_cuts": {
 "years": [
  "2016",
  "2017",
  "2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "2023",
  "2024",
  "2025",
  "2026_ytd_oct"
 ],
 "total": [
  526915,
  418770,
  538659,
  592556,
  2304755,
  321970,
  363824,
  721677,
  761358,
  1206374,
  617189
 ],
 "ai_cited": [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  4247,
  12742,
  54836,
  121401
 ]
},
"ai_cited_cuts_monthly": {
 "2024": [
  381,
  2,
  null,
  null,
  null,
  null,
  null,
  5943,
  5616,
  0,

                             28
  0,
  0
 ],
 "2024_mar_jul_combined": 800,
 "2025": [
  null,
  null,
  null,
  null,
  null,
  null,
  10300,
  0,
  7000,
  31039,
  6280,
  142
 ],
 "2025_jan_jun_combined": 75,
 "2026": [
  7624,
  4680,
  15341,
  21490,
  38579,
  14029,
  10970,
  3462,
  3961,
  1265
 ]
},
"subprime_auto_60plus_fitch": {
 "labels": [
  "Aug 2019",
  "Jan 2020",
  "May 2021",
  "Dec 2022",
  "Sep 2023",
  "Jan 2025",
  "Jan 2026",
  "Latest (restated Jul 2026)"
 ],
 "values": [
  5.93,
  5.83,
  2.58,
  5.7,
  6.1,
  6.56,
  6.9,
  6.27
 ]
},
"office_vacancy_moodys_annual": {
 "years": [
  2019,
  2020,
  2021,
  2022,
  2023,
  2024,
  2025

                                    29
 ],
 "values": [
  16.8,
  17.8,
  18.1,
  18.7,
  19.6,
  20.3,
  20.7
 ]
},
"yield_curve_10y2y_annual_avg_2006_2026ytd": [
 -0.02,
 0.27,
 1.65,
 2.31,
 2.51,
 2.33,
 1.53,
 2.04,
 2.08,
 1.45,
 1.0,
 0.93,
 0.38,
 0.17,
 0.5,
 1.18,
 -0.04,
 -0.62,
 -0.16,
 0.48,
 0.47
],
"vix_annual_avg_2006_2026ytd": [
 12.81,
 17.54,
 32.69,
 31.48,
 22.55,
 24.2,
 17.8,
 14.23,
 14.18,
 16.67,
 15.83,
 11.09,
 16.64,
 15.39,
 29.25,
 19.66,
 25.64,
 16.85,
 15.55,
 18.93,
 18.16
],
"broad_dollar_annual_avg_2006_2025": [
 98.6,
 93.81,
 90.88,
 96.75,
 93.05,

                                                 30
      88.78,
      91.64,
      92.76,
      95.59,
      108.17,
      113.07,
      112.81,
      112.0,
      115.73,
      117.77,
      113.11,
      120.7,
      120.27,
      122.89,
      122.72
     ]
 }

Notes: foreclosure_properties_with_filings 2014, 2021 and 2024 are derived values. bankruptcy_filings_total
2007–2008 are fiscal years. Texas metro permits are NSA annual totals from FRED. For ai_cited_cuts_monthly ,
null means the source reported only a combined total for those months (see the *_combined keys).

Appendix C: Source registry (every link used in the November 2026
edition)
        $129,400 — https://fred.stlouisfed.org/series/SPTNSAUS
        $84,400 (Jun 2019) — https://fred.stlouisfed.org/data/SPTNSAUS
        1,265 in October — https://www.challengergray.com/blog/category/job-cuts/
        10-year Treasury yield — https://tradingeconomics.com/united-states/government-bond-yield
        11,976 — https://www.texasmha.com/texas-manufactured-housing-market-report-sales-data-analysis
        12,742 in 2024 — https://www.challengergray.com/blog/2025-year-end-challenger-report-highest-q4-
        layoffs-since-2008-lowest-ytd-hiring-since-2010/
        14-year high — https://myneighborhoodnews.com/houston-area-home-sales-drop-149-in-october-2026-
        as-housing-supply-reaches-14-year-high
        147,854 units — https://fred.stlouisfed.org/series/TXBPPRIV
        155 days — https://www.thetitlereport.com/articles/97736.aspx
        16.8% (2019) — https://www.facilitiesdive.com/news/us-office-vacancy-rates-moodys-analysis/720862/
        165,000 jobs added — https://www.bls.gov/news.release/empsit.nr0.htm
        18.6% (Yardi) — https://www.credaily.com/?p=225102
        19-month high of 103.97 — https://www.fxstreet.com/news/us-dollar-takes-a-breather-after-rally-to-19-
        month-high-202611191423
        2.87M properties — https://www.calculatedriskblog.com/2010/01/realtytrac-2009-was-record-year-
        for.html
        2025 total 1.43M — https://www.census.gov/construction/bps/pdf/annual_highlights.pdf
        2026 low of 0.22 — https://www.connectcre.com/?p=496710
        21.9 months — https://www.mymetrotex.com/wp-content/uploads/2026/10/NTREIS-Monthly-MLS-
        Summary-Report-202609.pdf
        24.6% — https://www.credaily.com/?p=223979
        25.6% (Newmark) — https://www.credaily.com/?p=224274
        2s10s 2026 low (Connect CRE) — https://www.connectcre.com/?p=496710

                                                      31
3.75M pace (Oct) — https://www.nar.realtor/newsroom/existing-home-sales-decreased-5-5-percent-
october-nar-report
3.82% (Q2 2026) — https://fred.stlouisfed.org/series/CORCCACBS
32% of properties — https://www.apartmentlist.com/renter-life/where-rents-are-falling
367,460 — https://www.attomdata.com/?p=40719
37,215 in 2025 — https://www.attomdata.com/?p=40719
4.1% (Oct) — https://fred.stlouisfed.org/series/UNRATE
4.3% (Colliers) — https://www.colliers.com/en/research
4.96% of all household debt —
https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/hhdc_2026q3.pdf
46% of builders — https://www.nahb.org/news-and-economics/press-releases/2026/11/builder-
sentiment-continues-to-fall-on-affordability-concerns
5.1 months of supply — https://www.nar.realtor/newsroom/existing-home-sales-decreased-5-5-percent-
october-nar-report
5.5 vs. 5.1 months — https://myneighborhoodnews.com/houston-area-home-sales-drop-149-in-october-
2026-as-housing-supply-reaches-14-year-high
5.66% — https://www.newyorkfed.org/newsevents/news/research/2026/20261110
574,314 — https://www.uscourts.gov/node/62753/
6.5% (Sep) — https://www.staffingindustry.com/news/global-daily-news/eu-jobless-rate-rises-to-62-in-
september
6.8% (C&W) — https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats
7.28% — https://fred.stlouisfed.org/series/MORTGAGE30US
7.8% (CBRE) — https://www.cbre.com/insights/figures/dallas-fort-worth-industrial-figures-q3-2026
      90% chance — https://tradingeconomics.com/united-states/implied-rates/news/602003
abc7news.com: prior 12-month average of 48,000 — https://abc7news.com/story/consumer-prices-
increased-04-october-higher-expected/20029965/
Amazon ~$220B — https://tech-insider.org/big-tech-720-billion-data-center-spending-free-cash-flow-
2026/
Apartment List rent index — https://www.apartmentlist.com/renter-life/where-rents-are-falling
Apartments.com Texas multifamily 2026 — https://www.apartments.com/grow/learning-center/texas-
multifamily-market-conditions-2026
ATTOM mid-year 2026 — https://www.attomdata.com/?p=42129
ATTOM Q2 2026 flipping report — https://www.attomdata.com/news/market-trends/flipping/home-
flipping-profits-continue-gradual-two-year-decline/
ATTOM year-end 2025 — https://www.attomdata.com/?p=40719
attomdata.com: Aug 2026 filings +13% — https://www.attomdata.com/hnr/2026-q3-housing-news-report/
attomdata.com: foreclosure filings +21% — https://www.attomdata.com/?p=43794
Aug 2026 filings +13% — https://www.attomdata.com/hnr/2026-q3-housing-news-report/
Austin (−14.7%) — https://fred.stlouisfed.org/series/AUST448BPPRIV
Austin metro median $404,802 — https://cbsaustin.com/news/local/austin-area-home-prices-fall-nearly-
7-as-affordability-pressures-buyers
BLS CPI — https://www.bls.gov/news.release/cpi.htm
BLS jobs report — https://www.bls.gov/news.release/empsit.nr0.htm
BLS JOLTS — https://www.bls.gov/news.release/jolts.nr0.htm
bls.gov: energy +20.4% y/y — https://www.bls.gov/news.release/cpi.htm?lv=true

                                              32
bls.gov: No October annual rate was published — https://www.bls.gov/cpi/notices/2026/12m-changes-
202610.htm
Builder confidence 25 — https://www.nahb.org/news-and-economics/press-releases/2026/11/builder-
sentiment-continues-to-fall-on-affordability-concerns
C&W MarketBeats — https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats
calculatedriskblog.com: 2.87M properties — https://www.calculatedriskblog.com/2010/01/realtytrac-
2009-was-record-year-for.html
CBRE DFW industrial — https://www.cbre.com/insights/figures/dallas-fort-worth-industrial-figures-q3-
2026
CBRE figures — https://www.cbre.com/insights/figures
cbre.com: −0.6 pts y/y — https://www.cbre.com/insights/figures/q3-2026-us-office-market-report
Census MH prices (FRED) — https://fred.stlouisfed.org/series/SPTNSAUS
Census new residential construction — https://www.census.gov/construction/nrc/current/
Census permits Oct 2026 — https://www.census.gov/construction/nrc/pdf/newresconst_202610.pdf
census.gov: 2025 total 1.43M — https://www.census.gov/construction/bps/pdf/annual_highlights.pdf
Challenger reports — https://www.challengergray.com/blog/category/job-cuts/
challengergray.com: 12,742 in 2024 — https://www.challengergray.com/blog/2025-year-end-challenger-
report-highest-q4-layoffs-since-2008-lowest-ytd-hiring-since-2010/
closed at 24.52 — https://www.ad-hoc-news.de/boerse/news/marktberichte/vix-ends-november-18-at-
24-52-down-3-69-percent/70533036
Colliers research — https://www.colliers.com/en/research
credaily.com: 24.6% — https://www.credaily.com/?p=223979
CultureMap Austin Oct 2026 — https://austin.culturemap.com/news/real-estate/october-2026-real-
estate-report/
cushmanwakefield.com: Pipeline +23% y/y — https://www.cushmanwakefield.com/en/united-
states/insights/us-marketbeats/us-industrial-marketbeat
DOL weekly claims — https://www.dol.gov/ui/data.pdf
DXY 19-month high (FXStreet) — https://www.fxstreet.com/news/us-dollar-takes-a-breather-after-rally-
to-19-month-high-202611191423
DXY year-ago close (RTT) — https://www.rttnews.com/3598062/rate-cut-uncertainty-lifts-the-dollar.aspx
energy +20.4% y/y — https://www.bls.gov/news.release/cpi.htm?lv=true
Epiq Oct 2026 — https://www.abi.org/node/1004659
Euro-driven dollar rally (FXStreet) — https://www.fxstreet.com/analysis/why-the-us-dollars-rally-isnt-as-
strong-as-it-looks-202611111707
Eurostat — https://ec.europa.eu/eurostat
Eurostat bankruptcies — https://ec.europa.eu/eurostat/en/web/products-eurostat-news/w/ddn-20260817-
1
FHA foreclosure rate 1.89% — https://www.scotsmanguide.com/news/fha-and-va-foreclosures-reach-
highest-levels-in-nearly-a-decade/
Flips 6.2% — https://www.webull.com/news/15673816770479104
foreclosure filings +21% — https://www.attomdata.com/?p=43794
FRED 10-yr minus 2-yr — https://fred.stlouisfed.org/series/T10Y2Y
FRED Austin permits — https://fred.stlouisfed.org/series/AUST448BPPRIV
FRED broad dollar index — https://fred.stlouisfed.org/series/DTWEXBGS
FRED card charge-offs — https://fred.stlouisfed.org/series/CORCCACBS
FRED claims — https://fred.stlouisfed.org/series/CCSA

                                               33
FRED CPI — https://fred.stlouisfed.org/series/CPIAUCSL
FRED Dallas–FW permits — https://fred.stlouisfed.org/series/DALL148BPPRIV
FRED Houston permits — https://fred.stlouisfed.org/series/HOUS448BPPRIV
FRED junk spread — https://fred.stlouisfed.org/series/BAMLH0A0HYM2
FRED mortgage rates — https://fred.stlouisfed.org/series/MORTGAGE30US
FRED openings — https://fred.stlouisfed.org/series/JTSJOL
FRED San Antonio permits — https://fred.stlouisfed.org/series/SANA748BPPRIV
FRED Texas permits — https://fred.stlouisfed.org/series/TXBPPRIV
FRED unemployment — https://fred.stlouisfed.org/series/UNRATE
FRED VIX — https://fred.stlouisfed.org/series/VIXCLS
fred.stlouisfed.org: $84,400 (Jun 2019) — https://fred.stlouisfed.org/data/SPTNSAUS
freepressjournal.in: up to 20% of European bank jobs — https://freepressjournal.in/business/morgan-
stanley-warns-of-bank-job-cuts-in-europe-due-to-ai-productivity-gains
HAR October 2026 — https://myneighborhoodnews.com/houston-area-home-sales-drop-149-in-october-
2026-as-housing-supply-reaches-14-year-high
highest level since early 2019 — https://ec.europa.eu/eurostat/en/web/products-eurostat-news/w/ddn-
20260817-1
highest since November 2015 — https://eyeonhousing.org/2026/11/existing-home-sales-fell-to-16-year-
low/
housingwire.com: Starts +18% — https://www.housingwire.com/articles/us-foreclosures-rise-2026-
midyear-attom-report/
Houston (−14.3%) — https://fred.stlouisfed.org/series/HOUS448BPPRIV
Houston office (Newmark) — https://www.credaily.com/?p=224274
index 63.0 — https://pro.thestreet.com/market-commentary/existing-home-sales-fall-to-lowest-since-
2010-but-the-worst-may-be-yet-to-come
Inflation 3.7% — https://fred.stlouisfed.org/series/CPIAUCSL
junk-bond spread 3.52 — https://fred.stlouisfed.org/series/BAMLH0A0HYM2
Kastle Back to Work Barometer — https://www.kastle.com/safety-wellness/getting-america-back-to-work/
KPMG on CPI — https://kpmg.com/us/en/articles/2026/october-2026-cpi.html
LendingTree state bankruptcies — https://www.lendingtree.com/debt-consolidation/personal-bankruptcy-
study/
lowest close since late July — https://pro.thestreet.com/market-commentary/can-nvidia-save-the-indices
lowest since May 2020 — https://pro.thestreet.com/market-commentary/what-to-watch-as-housing-
starts-jump-but-total-permits-sink
lowest since Q1 2024 — https://pro.thestreet.com/market-commentary/household-debt-jumps-the-most-
since-2022-delinquencies-climb-to-highest-since-2016
manufacturedhomepronews.com: −5.1% vs. Jan–Aug 2025 —
https://www.manufacturedhomepronews.com/mharr-v-mhi-dueling-aug-2026-report-on-new-hud-code-
manufactured-housing-industry-data-what-the-latest-key-performance-indicators-kpis-revealed-
celebrate-hold-kpi-ignore-crooked-e-fea/
MetroTex Oct 2025 (DBJ) — https://homesusa.com/2025/12/11/dfw-housing-market-shows-signs-of-
stabilization-as-inventory-hits-highest-level-in-years/
MetroTex October (via agent summary) — https://www.yangtan.realtor/post/dallas-vs-fort-worth-same-
metro-two-very-different-housing-markets
MHI economic reports — https://www.manufacturedhousing.org/industry-resources/economic-reports/

                                              34
Moody's 2024 record (Facilities Dive) — https://www.facilitiesdive.com/news/us-office-vacancy-rates-
moodys-analysis/720862/
Moody's via Scotsman Guide — https://www.scotsmanguide.com/news/office-market-contracts-as-
economic-uncertainties-and-ai-pressures-persist/
Mortgage delinquency 4.42% — https://www.scotsmanguide.com/news/fha-and-va-foreclosures-reach-
highest-levels-in-nearly-a-decade/
much of the rise reflects a weaker euro — https://www.fxstreet.com/analysis/why-the-us-dollars-rally-
isnt-as-strong-as-it-looks-202611111707
NAHB HMI Nov 2026 — https://www.nahb.org/news-and-economics/press-releases/2026/11/builder-
sentiment-continues-to-fall-on-affordability-concerns
NAHB on months' supply — https://eyeonhousing.org/2026/11/existing-home-sales-fell-to-16-year-low/
NAHB on October permits — https://www.nahb.org/news-and-economics/press-releases/2026/11/single-
family-starts-post-modest-rebound-amid-challenging-conditions
NAR Oct 2026 — https://www.nar.realtor/newsroom/existing-home-sales-decreased-5-5-percent-
october-nar-report
new auto 90+ day delinquencies highest since 2010 — https://pro.thestreet.com/market-
commentary/household-debt-jumps-the-most-since-2022-delinquencies-climb-to-highest-since-2016
newyorkfed.org: 4.96% of all household debt —
https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/hhdc_2026q3.pdf
newyorkfed.org: recent-graduate unemployment 5.6% — https://www.newyorkfed.org/research/college-
labor-market
No October annual rate was published — https://www.bls.gov/cpi/notices/2026/12m-changes-202610.htm
NTREIS MLS Summary Sep 2026 — https://www.mymetrotex.com/wp-content/uploads/2026/10/NTREIS-
Monthly-MLS-Summary-Report-202609.pdf
NY Fed household debt Q3 2026 —
https://www.newyorkfed.org/newsevents/news/research/2026/20261110
peaked at 1.59M — https://www.uscourts.gov/node/3462
peaked at 9.6% — https://fred.stlouisfed.org/series/UNRATE
Pipeline +23% y/y — https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/us-
industrial-marketbeat
prior 12-month average of 48,000 — https://abc7news.com/story/consumer-prices-increased-04-
october-higher-expected/20029965/
pro.thestreet.com: index 63.0 — https://pro.thestreet.com/market-commentary/existing-home-sales-fall-
to-lowest-since-2010-but-the-worst-may-be-yet-to-come
pro.thestreet.com: lowest close since late July — https://pro.thestreet.com/market-commentary/can-
nvidia-save-the-indices
pro.thestreet.com: lowest since May 2020 — https://pro.thestreet.com/market-commentary/what-to-
watch-as-housing-starts-jump-but-total-permits-sink
pro.thestreet.com: total delinquency 4.96% — https://pro.thestreet.com/market-commentary/household-
debt-jumps-the-most-since-2022-delinquencies-climb-to-highest-since-2016
RealPage Aug 2026 — https://www.realpage.com/analytics/august-2026-us-data-update/
RealPage Q3 2026 via CRE Daily — https://www.credaily.com/?p=223707
recent-graduate unemployment 5.6% — https://www.newyorkfed.org/research/college-labor-market
record 20.7% — https://www.scotsmanguide.com/news/office-market-contracts-as-economic-
uncertainties-and-ai-pressures-persist/
SABOR September 2025 — https://sabor.com/wp-content/uploads/2025/10/SABOR-September-2025-SA-
Market-Stats-Press-Release.pdf

                                              35
SABOR September 2026 — https://myneighborhoodnews.com/san-antonio-housing-market-shifts-in-
september-2026-as-home-prices-fall-and-buyers-gain-more-options
San Antonio rose 4.3% — https://fred.stlouisfed.org/series/SANA748BPPRIV
scotsmanguide.com: Mortgage delinquency 4.42% — https://www.scotsmanguide.com/news/fha-and-va-
foreclosures-reach-highest-levels-in-nearly-a-decade/
shift toward cheaper sales — https://cbsaustin.com/news/local/austin-area-home-prices-fall-nearly-7-as-
affordability-pressures-buyers
single-family 772,000 — https://www.nahb.org/news-and-economics/press-releases/2026/11/single-
family-starts-post-modest-rebound-amid-challenging-conditions
space under construction +23% y/y — https://www.cushmanwakefield.com/en/united-states/insights/us-
marketbeats/us-industrial-marketbeat
spiking 70% to 28.18 — https://www.thetrading.tools/chart-of-the-day/2026-11-05-vix-up-70-percent-in-
a-day
staffingindustry.com: 6.5% (Sep) — https://www.staffingindustry.com/news/global-daily-news/eu-jobless-
rate-rises-to-62-in-september
Starts +18% — https://www.housingwire.com/articles/us-foreclosures-rise-2026-midyear-attom-report/
statewide median $325,000 — https://www.tpr.org/2026-11-18/san-antonio-home-sales-sluggish-but-not-
as-bad-as-texas-u-s-sales
steepest decline of any large U.S. metro — https://www.apartmentlist.com/renter-life/where-rents-are-
falling
Tech Insider on $720B capex — https://tech-insider.org/big-tech-720-billion-data-center-spending-free-
cash-flow-2026/
Texas listings rose 2.8% — https://www.webull.com/news/15780751986238464
Texas metros −1.2% to −3.8% — https://www.apartmentlist.com/renter-life/where-rents-are-falling
Texas MHA — https://www.texasmha.com/texas-manufactured-housing-market-report-sales-data-
analysis
Texas Public Radio (SABOR Oct 2026) — https://www.tpr.org/2026-11-18/san-antonio-home-sales-
sluggish-but-not-as-bad-as-texas-u-s-sales
Texas Realtors Q3 2026 — https://www.webull.com/news/15780751986238464
Texas rural land Q2 2026 (TRERC data) — https://texashuntingland.com/blog/texas-rural-land-market-
data
thetitlereport.com: 155 days — https://www.thetitlereport.com/articles/97736.aspx
total delinquency 4.96% — https://pro.thestreet.com/market-commentary/household-debt-jumps-the-
most-since-2022-delinquencies-climb-to-highest-since-2016
Trading Economics: Fed odds — https://tradingeconomics.com/united-states/implied-rates/news/602003
U.S. Courts bankruptcy statistics — https://www.uscourts.gov/node/62753/
U.S. occupancy 95.4% — https://www.credaily.com/?p=223707
UK 4.6% — https://www.thestar.com.my/news/world/2026/11/18/britain039s-unemployment-rate-at-46-
pct-in-q3
UK ONS (Xinhua) — https://www.thestar.com.my/news/world/2026/11/18/britain039s-unemployment-rate-
at-46-pct-in-q3
Unemployment 4.1% — https://fred.stlouisfed.org/series/UNRATE
Unlock MLS October 2026 (CBS Austin) — https://cbsaustin.com/news/local/austin-area-home-prices-
fall-nearly-7-as-affordability-pressures-buyers
Unlock MLS September 2026 — https://texags.com/forums/59/topics/3635243
up to 20% of European bank jobs — https://freepressjournal.in/business/morgan-stanley-warns-of-bank-
job-cuts-in-europe-due-to-ai-productivity-gains

                                               36
     uscourts.gov: peaked at 1.59M — https://www.uscourts.gov/node/3462
     VIX Nov 18 close — https://www.ad-hoc-news.de/boerse/news/marktberichte/vix-ends-november-18-at-
     24-52-down-3-69-percent/70533036
     VIX Nov 5 spike — https://www.thetrading.tools/chart-of-the-day/2026-11-05-vix-up-70-percent-in-a-day
     webull.com: Flips 6.2% — https://www.webull.com/news/15673816770479104
     wolfstreet.com: recent peaks — https://wolfstreet.com/2026/02/17/serious-delinquency-rates-for-
     subprime-prime-auto-loans-balances-and-debt-to-income-ratio-in-q4-2025/
     Yardi Dallas (CRE Daily) — https://www.credaily.com/?p=225102
     yardimatrix.com: Yardi 17.8% (−0.8 pts) — https://www.yardimatrix.com/blog/us-office-market-outlook/
     Yield curve Nov 17 2026 — https://www.allinvestview.com/yield-curve/
     Yield curve year ago (YCharts) — https://ycharts.com/indicators/210_year_treasury_yield_spread
     −0.6 pts y/y — https://www.cbre.com/insights/figures/q3-2026-us-office-market-report
     −5.1% vs. Jan–Aug 2025 — https://www.manufacturedhomepronews.com/mharr-v-mhi-dueling-aug-
     2026-report-on-new-hud-code-manufactured-housing-industry-data-what-the-latest-key-performance-
     indicators-kpis-revealed-celebrate-hold-kpi-ignore-crooked-e-fea/

Appendix D: Glossary (for /methodology and the What to watch notes)
     y/y: same period one year earlier (used for all arrows). m/m: compared with the prior month. YTD: year to
     date vs. the same months last year. Annual pace (SAAR): monthly figure, seasonally adjusted and scaled
     to a year. vs. 2019: pre-pandemic reference. 20-year average: 2006–2025. Peak/low: highest or lowest
     since the year named.
     Charge-off: debt written off as a loss. Delinquent: payment overdue by the stated number of days.
     Serious delinquency: 90+ days late.
     Vacancy: share of space empty. Occupancy (Kastle): office badge-ins compared with 2019.
     Building permit: local approval to build, usually ahead of construction.
     Months of inventory: listings ÷ monthly sales.
     Credit (junk-bond) spread: extra interest risky companies pay over the government.
     Yield curve: 10-year minus 2-year Treasury yield. Below zero is "inverted".
     VIX: expected S&P 500 swings over the next 30 days, derived from options prices. Above 20 is elevated,
     above 30 high.
     Dollar index (DXY): dollar vs. six major currencies. Fed broad index: vs. 26 trading partners.
     Sahm rule: recession signal triggered when the 3-month average unemployment rate rises 0.5 points
     above its 12-month low.
     "AI-cited" layoffs: what companies say; announced cuts are plans.
     Correlation: −1 to +1 measure of how two series moved together. It does not show cause.
     Not investment advice.

Appendix E: System prompt for the optional summary drafter ( draft-summary.ts )
 You draft the monthly "State of the Market" text for real estate investors. You will receive a JSON edition w
 ith every metric, its value, period, year-ago value, direction, color and source.
 Rules:
 1. Use ONLY numbers present in the JSON, with their periods. Never estimate, round differently than the "disp
 lay" field, or introduce outside facts.
 2. Be neutral. Describe what happened; do not forecast or advise. Banned words: will, expect, forecast, likel
 y, poised, bubble, crash, opportunity, should.

                                                      37
 3. No causal claims unless the JSON "notes" include a cited cause. Use "while" or "alongside" instead of "bec
 ause" or "driving".
 4. Never compare figures from different sources as one series; never pair different periods without labeling
 each.
 5. Output Markdown with: (a) "month_in_brief": 4–5 sentences, under 90 words; (b) "big_picture": 2–3 sentence
 s; (c) four themes (Housing, Building pipeline, Jobs, Household credit), each with 2 factual bullets and 1 bu
 llet starting "Other side:"; (d) one neutral email subject line under 70 characters.
 6. Plain English for non-economists. Short sentences.

Appendix F: First prompt to paste into Claude Code
 Read STATE_OF_THE_MARKET_SPEC.md in full. We are building the website it describes in this repository.
 Start with Phase 1 only: scaffold Next.js (App Router, TypeScript, Tailwind, Inter), implement the design tok
 ens (Section 4.2) and all components in Section 4.4, create data/editions/2026-11.json from Section 6 + Appen
 dix A, data/history/*.json from Appendix B, and data/config/metrics.yaml covering every metric in Sections 6
 and 11. Render the full edition page at "/" with all 16 sections in order. Use placeholder boxes for charts
 (Phase 2). Follow Section 5 rules exactly (arrows y/y only, polarity colors, no arrow without year-ago). Do n
 ot invent any data. When done, run the dev server, check mobile (375px) and desktop, and list what's complete
 vs. pending against the Phase 1 acceptance criteria.

                                                      38
```
