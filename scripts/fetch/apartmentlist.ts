// Apartment List rent estimates (SEMI, spec 11.1): U.S. and Texas metro median rent, latest month
// and the same month a year earlier.
//
// Source: the public "Rent Estimates" CSV on Apartment List's research data page
// (https://www.apartmentlist.com/research/category/data-rent-estimates). The download link changes
// each month, so set APARTMENTLIST_CSV_URL to the current link; the default below follows the
// historical naming pattern and is NOT confirmed (the site could not be reached from the build
// environment). Parsing is isolated in parseRentCsv() and expects the documented wide layout:
//   location_name, location_type, location_fips_code, population, state, county, metro, 2017_01, 2017_02, ...
// with an optional bed_size column (only "overall" rows are used when present).

import { csvToObjects, fetchText, type HttpOptions } from "./http";
import { computeLevel } from "./fred";
import type { Computed, Obs, SaveRaw } from "./types";

export const APARTMENTLIST_SOURCE_URL = "https://www.apartmentlist.com/research/category/data-rent-estimates";

export function defaultApartmentListUrl(edition: string): string {
  // Estimates for month M are published early in month M+1; use the previous month's file.
  const d = new Date(`${edition}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const ym = `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `https://static.apartmentlist.com/research/Apartment%20List%20Rent%20Estimates%20${ym}.csv`;
}

/** Locations to extract: metric id -> CBSA code (preferred) and a name prefix fallback. */
export const RENT_LOCATIONS: Record<string, { fips?: string; name: string; national?: boolean }> = {
  us_median_rent: { name: "United States", national: true },
  rent_dallas_fw: { fips: "19100", name: "Dallas" },
  rent_houston: { fips: "26420", name: "Houston" },
  rent_austin: { fips: "12420", name: "Austin" },
  rent_san_antonio: { fips: "41700", name: "San Antonio" },
};

const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((k) => row[k]).find((v) => v !== undefined) ?? "";

/** Parses the wide CSV into one monthly series per location in RENT_LOCATIONS (missing ids are omitted). */
export function parseRentCsv(text: string): Record<string, Obs[]> {
  let rows = csvToObjects(text);
  if (!rows.length) throw new Error("Apartment List CSV is empty");
  if ("bed_size" in rows[0]) rows = rows.filter((r) => r.bed_size.toLowerCase() === "overall");
  const monthCols = Object.keys(rows[0])
    .filter((k) => /^\d{4}_\d{2}$/.test(k))
    .sort();
  if (!monthCols.length) throw new Error("Apartment List CSV has no YYYY_MM columns");
  const out: Record<string, Obs[]> = {};
  for (const [id, loc] of Object.entries(RENT_LOCATIONS)) {
    const row = rows.find((r) => {
      const type = pick(r, "location_type", "locationtype").toLowerCase();
      const name = pick(r, "location_name", "location", "name");
      const fips = pick(r, "location_fips_code", "fips_code", "fips").replace(/^0+/, "");
      if (loc.national) return type === "national" || name === loc.name;
      if (type && type !== "metro") return false;
      return (loc.fips && fips === loc.fips) || name.startsWith(loc.name);
    });
    if (!row) continue;
    out[id] = monthCols.map((c) => {
      const n = row[c] === "" ? NaN : Number(row[c]);
      return { date: `${c.slice(0, 4)}-${c.slice(5, 7)}-01`, value: Number.isFinite(n) ? n : null };
    });
  }
  return out;
}

/** Rent rounded to whole dollars, as published. */
export function computeRent(series: Obs[]): Computed {
  const c = computeLevel(series, "monthly");
  return { ...c, value: Math.round(c.value!), year_ago: c.year_ago === null ? null : Math.round(c.year_ago) };
}

export async function fetchApartmentList(url: string, http?: HttpOptions, saveRaw?: SaveRaw): Promise<Record<string, Obs[]>> {
  const text = await fetchText(url, http);
  saveRaw?.("apartmentlist/rent_estimates.csv", text);
  return parseRentCsv(text);
}
