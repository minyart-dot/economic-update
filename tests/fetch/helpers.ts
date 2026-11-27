// Test helpers: a fake fetch that serves the synthetic fixtures in tests/fixtures/.

import fs from "node:fs";
import path from "node:path";
import type { FetchImpl } from "../../scripts/fetch/http";

export const ROOT = path.resolve(__dirname, "..", "..");
export const FIXTURES = path.join(ROOT, "tests", "fixtures");

export const fixture = (rel: string) => fs.readFileSync(path.join(FIXTURES, rel), "utf8");

const respond = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
  text: async () => body,
});

/** Serves FRED series from tests/fixtures/fred/<ID>.json (400 like FRED for unknown ids), Eurostat and Apartment List fixtures. */
export function fixtureFetch(log: string[] = []): FetchImpl {
  return async (url) => {
    log.push(url);
    const u = new URL(url);
    if (u.hostname === "api.stlouisfed.org") {
      const id = u.searchParams.get("series_id")!;
      const file = path.join(FIXTURES, "fred", `${id}.json`);
      if (!fs.existsSync(file)) {
        return respond(400, JSON.stringify({ error_code: 400, error_message: "Bad Request.  The series does not exist." }));
      }
      return respond(200, fs.readFileSync(file, "utf8"));
    }
    if (u.hostname === "ec.europa.eu") return respond(200, fixture("eurostat/une_rt_m.json"));
    if (u.hostname.endsWith("apartmentlist.com")) return respond(200, fixture("apartmentlist/rent_estimates.csv"));
    return respond(404, "not found");
  };
}

export const noSleep = async () => {};
