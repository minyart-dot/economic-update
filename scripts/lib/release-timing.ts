// Expected release timing for manually entered metrics (spec Section 11.2 table).
// Shown in data/manual/YYYY-MM.yaml so the owner knows whether a new number should be out yet.

import type { MetricConfig } from "../../lib/types";

const TIMING: Record<string, string> = {
  existing_home_sales: "NAR monthly release, ~3rd week of the month",
  median_existing_price: "NAR monthly release, ~3rd week of the month",
  months_inventory_us: "NAR monthly release, ~3rd week of the month",
  pending_home_sales_index: "NAR, ~end of the month",
  builder_confidence: "NAHB/Wells Fargo HMI, ~mid-month",
  builders_cutting_prices: "NAHB/Wells Fargo HMI, ~mid-month",
  job_cuts_ytd: "Challenger, Gray & Christmas, first week of the month",
  ai_cited_cuts_month: "Challenger, Gray & Christmas, first week of the month",
  recent_grad_unemployment: "NY Fed College Labor Market, quarterly",
  foreclosure_filings_h1: "ATTOM monthly, midyear and year-end reports, mid-month",
  foreclosure_starts_h1: "ATTOM monthly, midyear and year-end reports, mid-month",
  tx_foreclosure_starts_h1: "ATTOM monthly, midyear and year-end reports, mid-month",
  bankruptcies_ytd: "Epiq/ABI, first week of the month (annual totals from U.S. Courts)",
  tx_personal_bankruptcies: "LendingTree / U.S. Courts district tables, annual",
  subprime_auto_60: "Fitch auto ABS index (via press coverage), monthly",
  mortgage_delinquency: "MBA National Delinquency Survey, quarterly",
  fha_foreclosure_rate: "MBA National Delinquency Survey, quarterly",
  flip_gross_roi: "ATTOM Home Flipping Report, quarterly",
  flip_gross_profit: "ATTOM Home Flipping Report, quarterly",
  flip_rate: "ATTOM Home Flipping Report, quarterly",
  mh_production_ytd: "MHARR monthly (MHI annual)",
  tx_mh_titled: "Texas Manufactured Housing Association, monthly",
  texas_land_price_acre: "Texas Real Estate Research Center rural land report, quarterly",
  texas_median_price: "Texas Realtors / TRERC (TPR coverage), monthly",
  texas_months_inventory: "Texas Realtors / TRERC, monthly or quarterly",
  us_apartment_occupancy: "RealPage, quarterly",
  office_vacancy_cbre: "CBRE, quarterly",
  office_vacancy_yardi: "Yardi Matrix, monthly",
  office_vacancy_moodys: "Moody's, annual history",
  industrial_vacancy_cw: "Cushman & Wakefield MarketBeat, quarterly",
  retail_vacancy_colliers: "Colliers, quarterly",
  big_tech_capex: "Company guidance on earnings calls, quarterly",
  dxy: "ICE close via market news (e.g., FXStreet, RTT), monthly snapshot",
  fed_hike_odds: "CME FedWatch / Trading Economics, snapshot",
  us_median_rent: "Apartment List Rent Estimates, monthly (scripted download; enter by hand if it failed)",
  hh_debt_delinquent: "NY Fed Household Debt and Credit Report, quarterly",
  office_occupancy_kastle: "Kastle Back to Work Barometer, weekly",
};

const BY_FREQUENCY: Record<string, string> = {
  daily: "daily (use the latest close)",
  weekly: "weekly (use the latest week)",
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "annual",
  snapshot: "snapshot (use the latest reading)",
};

export function expectedRelease(id: string, cfg: MetricConfig): string {
  if (TIMING[id]) return TIMING[id];
  const freq = BY_FREQUENCY[cfg.frequency] ?? cfg.frequency;
  return cfg.automation === "AUTO"
    ? `${cfg.source_name}, ${freq}. Normally fetched automatically; listed here because no fresh value was fetched.`
    : `${cfg.source_name}, ${freq}`;
}
