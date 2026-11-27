// Chart datasets (spec Section 7), built at build time from /data/history and the edition.
// Every chart gets: the plotted rows, a data table for the "View data table" toggle, and a
// plain-language aria summary. No values are created here; only unit conversions
// (e.g. units -> thousands) and shares computed from published numbers.

import { formatInt } from "./format";
import type { Edition } from "./types";

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface ChartPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  table: ChartTable;
  summary: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const dash = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? "—" : fmt(v));

export const METRO_KEYS = [
  { key: "dfw", name: "Dallas–FW", short: "DFW", history: "Dallas–FW", color: "navy" },
  { key: "hou", name: "Houston", short: "Houston", history: "Houston", color: "teal" },
  { key: "aus", name: "Austin", short: "Austin", history: "Austin", color: "orange" },
  { key: "sat", name: "San Antonio", short: "San Antonio", history: "San Antonio", color: "purple" },
] as const;

export function buildChartData(ed: Edition): Record<string, ChartPayload> {
  // The edition's own history (frozen snapshot once published).
  const { us, tx, challenger: ch, gauges: g } = ed.history;
  const years = us.years_2006_2025;
  const last = years.length - 1;

  // ---------------------------------------------------------------- C1
  const c1 = years.map((year, i) => ({
    year,
    unemp: us.unemployment_rate_annual_avg_pct[i],
    mort: us.mortgage30_annual_avg_pct[i],
  }));

  // ---------------------------------------------------------------- C2
  const c2 = years.map((year) => {
    const fc = us.foreclosure_properties_with_filings[String(year)];
    const bk = us.bankruptcy_filings_total[String(year)];
    return { year, fc: fc != null ? fc / 1e6 : null, bk: bk != null ? bk / 1e6 : null, fcRaw: fc ?? null, bkRaw: bk ?? null };
  });

  // ---------------------------------------------------------------- C3
  const cj = ch.challenger_job_cuts;
  const c3 = cj.years.map((y, i) => ({
    year: y.startsWith("2026") ? "2026 YTD" : y,
    total: cj.total[i],
    ai: cj.ai_cited[i],
    aiPct: cj.ai_cited[i] > 0 ? (cj.ai_cited[i] / cj.total[i]) * 100 : 0,
  }));

  // ---------------------------------------------------------------- C4
  const m = ch.ai_cited_cuts_monthly;
  const c4: { key: string; label: string; tick: string; year: number; value: number | null }[] = [];
  for (const year of [2024, 2025, 2026]) {
    const arr = m[String(year)] as (number | null)[];
    arr.forEach((v, i) =>
      c4.push({ key: `${year}-${String(i + 1).padStart(2, "0")}`, label: `${MONTHS[i]} ${year}`, tick: `${MONTHS[i]} ’${String(year).slice(2)}`, year, value: v }),
    );
  }
  const c4Annotations = [
    { from: "2024-03", to: "2024-07", text: `Mar–Jul 2024: ${formatInt(m["2024_mar_jul_combined"] as number)} total` },
    { from: "2025-01", to: "2025-06", text: `Jan–Jun 2025: ${formatInt(m["2025_jan_jun_combined"] as number)} total` },
  ];

  // ---------------------------------------------------------------- C5, C6
  const c5 = years.map((year, i) => ({ year, v: us.card_chargeoff_q4_pct[i] }));
  const sa = us.subprime_auto_60plus_fitch;
  const c6 = sa.labels.map((label, i) => {
    const restated = label.toLowerCase().includes("restated");
    return { label, tick: restated ? "Latest*" : label.replace(/ (\d{2})(\d{2})$/, " ’$2"), v: sa.values[i], restated };
  });

  // ---------------------------------------------------------------- C7, C8
  const c7 = years.map((year, i) => ({
    year,
    us: us.us_permits_thousands_nsa[i],
    tx: tx.texas_permits_units_nsa[i] / 1000,
    txRaw: tx.texas_permits_units_nsa[i],
  }));
  const c8 = years.map((year, i) => ({ year, v: us.manufactured_home_shipments[i] }));

  // ---------------------------------------------------------------- C9-C11
  const mv = us.office_vacancy_moodys_annual;
  const c9 = mv.years.map((year, i) => ({ year, v: mv.values[i] }));
  const c10 = ed.sections.cre.c10 as { sector: string; value: number; color: string }[];
  const c11 = ed.sections.cre.c11 as { market: string; value: number }[];

  // ---------------------------------------------------------------- C12-C14
  const c12 = years.map((year, i) => {
    const row: Record<string, number> = { year };
    for (const mk of METRO_KEYS) row[mk.key] = tx.texas_metro_permits_units_nsa[mk.history][i];
    return row;
  });
  const metroPct = new Map(ed.tables.metros.map((r) => [r.history_key, r.permits_yy_pct]));
  const txPermits = ed.metrics.permits_texas_ytd;
  const c13 = [
    ...METRO_KEYS.map((mk) => ({ name: mk.name, key: mk.key, pct: metroPct.get(mk.history) as number })),
    { name: "Texas", key: "tx", pct: Math.round((txPermits.change_pct ?? 0) * 10) / 10 },
  ];
  const c14src = ed.sections["tx-metros"].c14 as { metro: string; rent: number; yy: number }[];
  const c14 = c14src.map((r) => ({ ...r, key: METRO_KEYS.find((mk) => mk.name === r.metro)?.key ?? "dfw" }));

  // ---------------------------------------------------------------- C15
  const c15 = years.map((year, i) => ({ year, permits: us.us_permits_thousands_nsa[i], unemp: us.unemployment_rate_annual_avg_pct[i] }));

  // ---------------------------------------------------------------- C16
  const c16 = ed.sections.inventory.c16 as { market: string; months: number; year_ago: number }[];

  // ---------------------------------------------------------------- C17
  const gy = g.years_2006_2026ytd;
  const c17 = gy.map((year, i) => ({
    year,
    label: year === 2026 ? "2026 YTD" : String(year),
    yc: g.yield_curve_10y2y_annual_avg_2006_2026ytd[i],
    vix: g.vix_annual_avg_2006_2026ytd[i],
    dollar: g.broad_dollar_annual_avg_2006_2025[i] ?? null,
  }));

  const peakU = Math.max(...c1.map((d) => d.unemp));
  const maxBy = <T,>(arr: T[], f: (d: T) => number | null) => arr.reduce((a, b) => ((f(b) ?? -Infinity) > (f(a) ?? -Infinity) ? b : a));
  const minBy = <T,>(arr: T[], f: (d: T) => number | null) => arr.reduce((a, b) => ((f(b) ?? Infinity) < (f(a) ?? Infinity) ? b : a));
  const mil = (n: number) => `${(n / 1e6).toFixed(2)} million`;
  const fcPeak = maxBy(c2, (d) => d.fcRaw);
  const bkPeak = maxBy(c2, (d) => d.bkRaw);
  const usLow = minBy(c7, (d) => d.us);
  const txPeak = maxBy(c7, (d) => d.txRaw);
  const mhLow = minBy(c8, (d) => d.v);
  const ycNeg = c17.filter((d) => d.yc < 0).map((d) => d.label);
  const vixTop = [...c17].sort((a, b) => b.vix - a.vix).slice(0, 2);
  const dollarLast = c17.filter((d) => d.dollar != null).at(-1)!;
  const c3Last = c3[c3.length - 1];
  const lowM = Math.min(...c1.map((d) => d.mort));

  return {
    C1: {
      data: c1,
      table: { columns: ["Year", "Unemployment rate (%)", "30-yr mortgage rate (%)"], rows: c1.map((d) => [d.year, f2(d.unemp), f2(d.mort)]) },
      summary: `Line chart, 2006 to 2025. Unemployment peaked at ${pct(peakU)} in ${c1.find((d) => d.unemp === peakU)!.year} and averaged ${pct(c1[last].unemp)} in 2025. The 30-year mortgage rate bottomed at ${pct(lowM, 2)} in ${c1.find((d) => d.mort === lowM)!.year} and averaged ${pct(c1[last].mort, 2)} in 2025.`,
    },
    C2: {
      data: c2,
      table: {
        columns: ["Year", "Foreclosure filings (properties)", "Bankruptcy filings"],
        rows: c2.map((d) => [d.year, dash(d.fcRaw, formatInt), dash(d.bkRaw, formatInt)]),
      },
      summary: `Line chart, 2006 to 2025, in millions. Foreclosure filings peaked at ${mil(fcPeak.fcRaw!)} properties in ${fcPeak.year} and were ${mil(c2[last].fcRaw!)} in 2025. Bankruptcy filings (from 2007) peaked at ${mil(bkPeak.bkRaw!)} in ${bkPeak.year} and were ${mil(c2[last].bkRaw!)} in 2025.`,
    },
    C3: {
      data: c3,
      table: {
        columns: ["Year", "Announced job cuts", "AI-cited cuts", "AI share"],
        rows: c3.map((d) => [d.year, formatInt(d.total), formatInt(d.ai), d.ai > 0 ? pct(d.aiPct) : "—"]),
      },
      summary: `Bar chart of announced job cuts per year, 2016 to 2026 year to date, with AI-cited cuts overlaid. AI-cited cuts were ${c3.filter((d) => d.ai > 0).map((d) => `${formatInt(d.ai)} in ${d.year}`).join(", ")}; in 2026 to date that is ${pct(c3Last.aiPct)} of ${formatInt(c3Last.total)} cuts.`,
    },
    C4: {
      data: { rows: c4, annotations: c4Annotations },
      table: {
        columns: ["Month", "AI-cited job cuts"],
        rows: c4.map((d) => [d.label, d.value == null ? "combined total only" : formatInt(d.value)]),
      },
      summary: "Monthly bar chart of AI-cited job cuts from January 2024 to October 2026. The peak was 38,579 in May 2026; October 2025 was 31,039 and October 2026 was 1,265. March–July 2024 (800) and January–June 2025 (75) were reported only as combined totals.",
    },
    C5: {
      data: c5,
      table: { columns: ["Year (Q4)", "Card charge-off rate (%)"], rows: c5.map((d) => [d.year, f2(d.v)]) },
      summary: `Area chart of the Q4 credit card charge-off rate, 2006 to 2025. It peaked at 10.54% in 2009 and was ${pct(c5[last].v, 2)} in 2025.`,
    },
    C6: {
      data: c6,
      table: { columns: ["Period", "Subprime auto 60+ days late (%)"], rows: c6.map((d) => [d.label, f2(d.v)]) },
      summary: `Bar chart of Fitch's subprime auto 60+ day delinquency index at selected dates from ${c6[0].label} to the latest restated reading of ${pct(c6[c6.length - 1].v, 2)}. Earlier bars are pre-restatement and not directly comparable.`,
    },
    C7: {
      data: c7,
      table: {
        columns: ["Year", "U.S. permits (thousands)", "Texas permits (units)"],
        rows: c7.map((d) => [d.year, f1(d.us), formatInt(d.txRaw)]),
      },
      summary: `Two bar charts of housing units authorized by permits, 2006 to 2025. U.S. permits fell to a low of ${formatInt(Math.round(usLow.us * 1000))} in ${usLow.year} and were ${formatInt(Math.round(c7[last].us * 1000))} in 2025. Texas peaked at ${formatInt(txPeak.txRaw)} in ${txPeak.year} and was ${formatInt(c7[last].txRaw)} in 2025.`,
    },
    C8: {
      data: c8,
      table: { columns: ["Year", "Manufactured home shipments"], rows: c8.map((d) => [d.year, formatInt(d.v)]) },
      summary: `Bar chart of manufactured home shipments, 2006 to 2025. The low was ${formatInt(mhLow.v)} in ${mhLow.year}; 2025 was ${formatInt(c8[last].v)}.`,
    },
    C9: {
      data: c9,
      table: { columns: ["Year", "Office vacancy, Moody's (%)"], rows: c9.map((d) => [d.year, f1(d.v)]) },
      summary: `Line chart of national office vacancy (Moody's), from ${pct(c9[0].v)} in ${c9[0].year} to ${pct(c9[c9.length - 1].v)} in ${c9[c9.length - 1].year}. A dashed line marks the prior record of 19.3% (1986 and 1991).`,
    },
    C10: {
      data: c10,
      table: { columns: ["Sector", "Vacancy, Q3 2026 (%)"], rows: c10.map((d) => [d.sector, f1(d.value)]) },
      summary: `Bar chart of vacancy by sector in Q3 2026: ${c10.map((d) => `${d.sector} ${pct(d.value)}`).join(", ")}.`,
    },
    C11: {
      data: c11,
      table: { columns: ["Market", "Office vacancy, Sep 2026 (%)"], rows: c11.map((d) => [d.market, f1(d.value)]) },
      summary: `Horizontal bar chart of office vacancy in September 2026 (Yardi): ${c11.map((d) => `${d.market} ${pct(d.value)}`).join(", ")}.`,
    },
    C12: {
      data: c12,
      table: {
        columns: ["Year", ...METRO_KEYS.map((mk) => mk.name)],
        rows: c12.map((d) => [d.year, ...METRO_KEYS.map((mk) => formatInt(d[mk.key]))]),
      },
      summary: `Line chart of housing units authorized by permits in four Texas metros, 2006 to 2025. In 2025: ${METRO_KEYS.map((mk) => `${mk.name} ${formatInt(c12[last][mk.key])}`).join(", ")}.`,
    },
    C13: {
      data: c13,
      table: { columns: ["Area", "Permits Jan–Sep 2026 vs. 2025"], rows: c13.map((d) => [d.name, signedPct(d.pct)]) },
      summary: `Horizontal bar chart of the change in permits, January–September 2026 vs. 2025: ${c13.map((d) => `${d.name} ${signedPct(d.pct)}`).join(", ")}.`,
    },
    C14: {
      data: c14,
      table: { columns: ["Metro", "Median rent, Oct 2026", "Change y/y"], rows: c14.map((d) => [d.metro, `$${formatInt(d.rent)}`, signedPct(d.yy)]) },
      summary: `Bar chart of median apartment rent in October 2026: ${c14.map((d) => `${d.metro} $${formatInt(d.rent)} (${signedPct(d.yy)} y/y)`).join(", ")}.`,
    },
    C15: {
      data: c15,
      table: { columns: ["Year", "U.S. permits (thousands)", "Unemployment rate (%)"], rows: c15.map((d) => [d.year, f1(d.permits), f2(d.unemp)]) },
      summary: `Bars show U.S. building permits (thousands, left axis) and a line shows the unemployment rate (right axis), 2006 to 2025. Permits were ${formatInt(Math.round(c15[0].permits * 1000))} in 2006 and ${formatInt(Math.round(usLow.us * 1000))} in ${usLow.year}; unemployment peaked at ${pct(peakU)} in ${c1.find((d) => d.unemp === peakU)!.year}.`,
    },
    C16: {
      data: c16,
      table: { columns: ["Market", "Months of inventory", "Year ago"], rows: c16.map((d) => [d.market, String(d.months), String(d.year_ago)]) },
      summary: `Horizontal bar chart of months of inventory with year-ago markers: ${c16.map((d) => `${d.market} ${d.months} (year ago ${d.year_ago})`).join(", ")}. A shaded band marks the commonly cited balanced range of 4.5 to 6 months.`,
    },
    C17: {
      data: c17,
      table: {
        columns: ["Year", "Yield curve 10y–2y (pts)", "VIX", "Fed broad dollar index"],
        rows: c17.map((d) => [d.label, f2(d.yc), f2(d.vix), d.dollar == null ? "—" : f2(d.dollar)]),
      },
      summary: `Three small charts of annual averages, 2006 to 2026 to date. The yield curve averaged below zero in ${ycNeg.join(", ")} and ${f2(c17[c17.length - 1].yc)} in 2026 to date. The VIX's highest annual averages were ${vixTop.map((d) => `${f2(d.vix)} in ${d.label}`).join(" and ")}; 2026 to date is ${f2(c17[c17.length - 1].vix)}. The Fed broad dollar index went from ${f2(c17[0].dollar!)} in 2006 to ${f2(dollarLast.dollar!)} in ${dollarLast.label}.`,
    },
  };
}
