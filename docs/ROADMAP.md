# Roadmap

## Later: accounts and personal alerts (owner request, Nov 2026)

Readers can create an account and set their own alerts on any metric, for example:

- the 30-year mortgage rate moves up or down by more than a set amount (e.g. 0.25 points);
- office occupancy falls below a level they choose;
- foreclosure filings move in a direction or by a percentage they choose.

When new data lands and a rule is met, the reader gets an email (later maybe SMS or push).

### How it fits what exists

- **Metric ids are already stable** (`data/config/metrics.yaml`), and every edition stores each metric's value,
  period, year-ago value and computed change (`data/editions/YYYY-MM.json`). An alert rule is just
  `{ metric, condition, threshold }` checked against the newest value.
- **Conditions to support:** crosses above / below a level; changes by at least X (points or %) vs. the prior
  reading; changes by at least X vs. a year ago. Daily series (mortgage rate, 10-yr Treasury, VIX, yield curve)
  can be checked daily; monthly and quarterly ones when the edition is built.
- **Topic choices** (today saved in the reader's browser, `lib/topics.ts`) move into the account so they follow the
  reader across devices.
- **Neutral wording stays:** alerts say what crossed, with the source and date ("The 30-year mortgage rate was
  7.53% on Dec 4, up 0.25 points from Nov 26"), never advice or predictions.

### What it adds

- Sign-in (email magic link; no passwords), e.g. Supabase Auth or Clerk.
- A small database for accounts, alert rules and a log of sent alerts (Supabase Postgres free tier).
- Per-person transactional email (e.g. Resend). Buttondown stays for the monthly newsletter; it is built for
  one email to everyone, not individual alerts.
- A scheduled job (GitHub Actions or Vercel Cron) that evaluates rules after each data update, with
  de-duplication so a rule fires once per crossing, and a one-click "pause this alert" link in every email.
- Privacy page and account deletion.

Free tiers likely cover the first few hundred users; confirm before choosing paid services (spec 0.5).
