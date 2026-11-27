// Computed analytics from /data/history (spec Section 11.6). Pure functions.

import type { Correlation } from "./types";

export interface UsAnnual {
  years_2006_2025: number[];
  unemployment_rate_annual_avg_pct: number[];
  mortgage30_annual_avg_pct: number[];
  card_chargeoff_q4_pct: number[];
  foreclosure_properties_with_filings: Record<string, number>;
  bankruptcy_filings_total: Record<string, number>;
  us_permits_thousands_nsa: number[];
  manufactured_home_shipments: number[];
  subprime_auto_60plus_fitch: { labels: string[]; values: number[] };
  office_vacancy_moodys_annual: { years: number[]; values: number[] };
}

export interface TexasAnnual {
  years_2006_2025: number[];
  texas_permits_units_nsa: number[];
  texas_metro_permits_units_nsa: Record<string, number[]>;
}

export function pearson(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) throw new Error("pearson: bad input");
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const PANDEMIC = new Set([2020, 2021]);

/** The five correlations listed in spec Sections 6.3 and 11.6, Pearson on annual series. */
export function computeCorrelations(us: UsAnnual, tx: TexasAnnual): Correlation[] {
  const years = us.years_2006_2025;
  const u = us.unemployment_rate_annual_avg_pct;
  const p = us.us_permits_thousands_nsa;
  const c = us.card_chargeoff_q4_pct;
  const t = tx.texas_permits_units_nsa;
  const f = years.map((y) => us.foreclosure_properties_with_filings[String(y)]);

  // % change in permits in year t vs. change in unemployment from t to t+1 (18 pairs).
  const lagX: number[] = [];
  const lagY: number[] = [];
  for (let i = 1; i < years.length - 1; i++) {
    lagX.push((p[i] - p[i - 1]) / p[i - 1]);
    lagY.push(u[i + 1] - u[i]);
  }

  const ex = <T,>(arr: T[]) => arr.filter((_, i) => !PANDEMIC.has(years[i]));
  const cardAll = r2(pearson(u, c));
  const cardEx = r2(pearson(ex(u), ex(c)));

  const i2006 = years.indexOf(2006);
  const i2009 = years.indexOf(2009);
  const permitFall = Math.round(((p[i2009] - p[i2006]) / p[i2006]) * -100);
  const peakU = Math.max(...u);
  const peakYear = years[u.indexOf(peakU)];

  return [
    {
      id: "unemp_foreclosures",
      label: "Unemployment vs. foreclosures",
      r: r2(pearson(u, f)),
      n: years.length,
      plain: "Higher unemployment years usually had more foreclosures",
    },
    {
      id: "unemp_permits",
      label: "Unemployment vs. building permits",
      r: r2(pearson(u, p)),
      n: years.length,
      plain: "Permits tend to be low when unemployment is high",
    },
    {
      id: "permits_lead_unemp",
      label: "Permit change vs. unemployment change the following year",
      r: r2(pearson(lagX, lagY)),
      n: lagX.length,
      plain: `Permits fell ${permitFall}% from 2006 to 2009 before unemployment peaked in ${peakYear}`,
    },
    {
      id: "unemp_card",
      label: "Unemployment vs. card charge-offs",
      r: cardEx,
      n: ex(years).length,
      plain: "Card losses rise and fall with jobs",
      note: `Excludes 2020–21 pandemic years (${fmtR(cardAll)} with them).`,
    },
    {
      id: "tx_us_permits",
      label: "Texas permits vs. U.S. permits",
      r: r2(pearson(t, p)),
      n: years.length,
      plain: "Texas building closely tracks the national cycle",
    },
  ];
}

export function fmtR(r: number): string {
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;
}

/** Value in a given year plus the peak year/value of a metro permit series. */
export function metroPermitStats(tx: TexasAnnual, key: string) {
  const s = tx.texas_metro_permits_units_nsa[key];
  if (!s) return null;
  const years = tx.years_2006_2025;
  const v2019 = s[years.indexOf(2019)];
  const peak = Math.max(...s);
  const peakYear = years[s.indexOf(peak)];
  return { v2019, peak, peakYear };
}

export function average(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
