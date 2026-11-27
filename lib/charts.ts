// Chart catalog (spec Section 7). Phase 1 renders placeholders; Phase 2 adds Recharts.

export interface ChartSpec {
  id: string;
  title: string;
  type: string;
  dataKey: string;
  caption: string;
  sources: string[];
  half?: boolean;
}

const FRED = (s: string) => `https://fred.stlouisfed.org/series/${s}`;

export const CHARTS: Record<string, ChartSpec> = {
  C1: {
    id: "C1",
    title: "Unemployment and 30-yr mortgage rate, 2006–2025",
    type: "2 lines + shaded bands",
    dataKey: "unemployment_rate_annual_avg_pct, mortgage30_annual_avg_pct",
    caption:
      "Annual averages. Sources: BLS via FRED (UNRATE); Freddie Mac PMMS via FRED (MORTGAGE30US). Shaded: 2008–09 recession, 2020 pandemic.",
    sources: [FRED("UNRATE"), FRED("MORTGAGE30US")],
  },
  C2: {
    id: "C2",
    title: "Foreclosures and bankruptcies, 2006–2025 (millions)",
    type: "2 lines (millions)",
    dataKey: "foreclosure_properties_with_filings, bankruptcy_filings_total",
    caption:
      "Sources: RealtyTrac/ATTOM year-end reports (2014, 2021 and 2024 derived from reported % changes); U.S. Courts (2007–08 are fiscal years). Bankruptcies start 2007.",
    sources: ["https://www.attomdata.com/?p=40719", "https://www.uscourts.gov/node/62753/"],
  },
  C3: {
    id: "C3",
    title: "Announced job cuts per year, with AI-cited cuts, 2016–2026 YTD",
    type: "overlaid bars",
    dataKey: "challenger_job_cuts",
    caption: "Source: Challenger, Gray & Christmas. 2026 is January–October.",
    sources: ["https://www.challengergray.com/blog/category/job-cuts/"],
  },
  C4: {
    id: "C4",
    title: "AI-cited job cuts by month, Jan 2024 to latest",
    type: "bars",
    dataKey: "ai_cited_cuts_monthly",
    caption:
      "Source: Challenger, Gray & Christmas. Empty months: the source reported only a combined total (Mar–Jul 2024: 800 total; Jan–Jun 2025: 75 total).",
    sources: ["https://www.challengergray.com/blog/category/job-cuts/"],
  },
  C5: {
    id: "C5",
    title: "Credit card charge-off rate, Q4 each year, 2006–2025",
    type: "area line",
    dataKey: "card_chargeoff_q4_pct",
    caption: "Source: Federal Reserve via FRED (CORCCACBS).",
    sources: [FRED("CORCCACBS")],
    half: true,
  },
  C6: {
    id: "C6",
    title: "Subprime auto loans 60+ days late (Fitch)",
    type: "bars",
    dataKey: "subprime_auto_60plus_fitch",
    caption:
      "Fitch restated the index in July 2026; earlier bars are pre-restatement and not directly comparable.",
    sources: [
      "https://wolfstreet.com/2026/02/17/serious-delinquency-rates-for-subprime-prime-auto-loans-balances-and-debt-to-income-ratio-in-q4-2025/",
    ],
    half: true,
  },
  C7: {
    id: "C7",
    title: "Housing units authorized by building permits, 2006–2025",
    type: "2 bar panels",
    dataKey: "us_permits_thousands_nsa, texas_permits_units_nsa",
    caption: "U.S. in thousands; Texas in thousands of units. Source: Census via FRED (not seasonally adjusted).",
    sources: ["https://www.census.gov/construction/bps/pdf/annual_highlights.pdf", FRED("TXBPPRIV")],
  },
  C8: {
    id: "C8",
    title: "Manufactured home shipments, 2006–2025",
    type: "bars",
    dataKey: "manufactured_home_shipments",
    caption: "MHI shipments 2006–2024; MHARR production 2025. The two series are not identical.",
    sources: ["https://www.manufacturedhousing.org/industry-resources/economic-reports/"],
  },
  C9: {
    id: "C9",
    title: "National office vacancy (Moody's), 2019–2025",
    type: "line + reference line",
    dataKey: "office_vacancy_moodys_annual",
    caption: "Source: Moody's. Dashed line: prior record of 19.3% (1986 and 1991).",
    sources: [
      "https://www.facilitiesdive.com/news/us-office-vacancy-rates-moodys-analysis/720862/",
      "https://www.scotsmanguide.com/news/office-market-contracts-as-economic-uncertainties-and-ai-pressures-persist/",
    ],
    half: true,
  },
  C10: {
    id: "C10",
    title: "Vacancy by sector, Q3 2026",
    type: "bars",
    dataKey: "edition values",
    caption: "Sources: CBRE (office), Colliers and C&W (retail), C&W (industrial). Each firm measures differently.",
    sources: ["https://www.cbre.com/insights/figures", "https://www.colliers.com/en/research", "https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats"],
    half: true,
  },
  C11: {
    id: "C11",
    title: "Texas office vacancy, Sep 2026 (Yardi)",
    type: "horizontal bars",
    dataKey: "edition values",
    caption: "Source: Yardi Matrix.",
    sources: ["https://www.yardimatrix.com/blog/us-office-market-outlook/"],
    half: true,
  },
  C12: {
    id: "C12",
    title: "Housing units authorized by permits, Texas metros, 2006–2025",
    type: "4 lines",
    dataKey: "texas_metro_permits_units_nsa",
    caption: "Source: Census via FRED, metro annual totals, not seasonally adjusted.",
    sources: [FRED("DALL148BPPRIV"), FRED("HOUS448BPPRIV"), FRED("AUST448BPPRIV"), FRED("SANA748BPPRIV")],
  },
  C13: {
    id: "C13",
    title: "Permit change, Jan–Sep 2026 vs. 2025",
    type: "horizontal diverging bars",
    dataKey: "edition values",
    caption: "Source: Census via FRED, not seasonally adjusted. Texas statewide in grey.",
    sources: [FRED("TXBPPRIV")],
    half: true,
  },
  C14: {
    id: "C14",
    title: "Median apartment rent and y/y change, Oct 2026",
    type: "bars",
    dataKey: "edition values",
    caption: "Source: Apartment List Rent Index.",
    sources: ["https://www.apartmentlist.com/renter-life/where-rents-are-falling"],
    half: true,
  },
  C15: {
    id: "C15",
    title: "U.S. building permits vs. unemployment rate, 2006–2025",
    type: "bars + line, dual axis",
    dataKey: "us_permits_thousands_nsa, unemployment_rate_annual_avg_pct",
    caption: "Permits in thousands (bars, left axis); unemployment rate, annual average (line, right axis). Sources: Census; BLS via FRED.",
    sources: ["https://www.census.gov/construction/bps/pdf/annual_highlights.pdf", FRED("UNRATE")],
  },
  C16: {
    id: "C16",
    title: "Months of inventory, latest vs. a year ago",
    type: "horizontal bars + year-ago markers + band",
    dataKey: "edition values",
    caption: "Orange marks show a year ago. Shaded 4.5–6 months: commonly cited 'balanced' range (NAHB). Sources: NAR, Texas Realtors, MetroTex, HAR, Unlock MLS, SABOR.",
    sources: ["https://www.nar.realtor/newsroom/existing-home-sales-decreased-5-5-percent-october-nar-report"],
  },
  C17: {
    id: "C17",
    title: "Market risk gauges, annual averages, 2006–2026 YTD",
    type: "3 small panels",
    dataKey: "yield_curve_10y2y_annual_avg_2006_2026ytd, vix_annual_avg_2006_2026ytd, broad_dollar_annual_avg_2006_2025",
    caption:
      "Annual averages. The dollar panel uses the Fed broad trade-weighted index (26 currencies), which differs from the six-currency DXY. Sources: FRED T10Y2Y, VIXCLS, DTWEXBGS.",
    sources: [FRED("T10Y2Y"), FRED("VIXCLS"), FRED("DTWEXBGS")],
  },
};
