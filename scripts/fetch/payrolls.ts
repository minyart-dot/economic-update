// payrolls_change ("Jobs added", nonfarm payrolls, monthly; spec 11.1 BLS jobs report).
//
// Source: FRED PAYEMS (total nonfarm, thousands of persons, SA). Fallback, only when the FRED path
// fails: BLS Public Data API v2 series CES0000000001 (the same CES series, also in thousands).
//
//   value     latest month level minus the prior month level, in persons (x1000). Both months are
//             re-pulled on every run, so BLS's revisions to the prior months flow in (spec 11.4).
//   display   "+165,000" (sign always shown; negative uses "−").
//   notes     "Prior 12-month average 48,000.": the mean of the 12 monthly changes before the latest
//             month, rounded to the nearest thousand (BLS states payroll changes in thousands).
//   year_ago  null on purpose. A y/y arrow on a monthly flow compares two single, noisy monthly changes
//             (e.g. +165,000 vs. −30,000), and the percentage change and 1% flat band (spec 5.2) are
//             meaningless for a figure that crosses zero. The comparison is spelled out in words in the
//             notes instead (spec 5.1 allows this), matching the published edition.
// A missing month is never filled (spec 0.3): no change is computed across a gap, and the 12-month
// average is omitted when either end of its range is missing.

import { blsSeriesUrl, fetchBlsSeries } from "./bls";
import type { SeriesGetter } from "./fred";
import { fredSeriesUrl } from "./fred";
import type { HttpOptions } from "./http";
import { addMonths, clean, latestObs, monthLabel } from "./periods";
import type { AutoRecord, Computed, Obs, SaveRaw } from "./types";

export const PAYROLLS_METRIC = "payrolls_change";
export const PAYROLLS_FRED_SERIES = "PAYEMS";
export const PAYROLLS_BLS_SERIES = "CES0000000001";

/** "+165,000", "−20,000", "0". */
export function formatSignedCount(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

const valueAt = (obs: Obs[], date: string) => obs.find((o) => o.date === date)?.value ?? null;

/** Monthly change from a level series in thousands (FRED PAYEMS / BLS CES0000000001). */
export function computePayrollsChange(levels: Obs[]): Computed & { notes?: string } {
  const last = latestObs(levels);
  if (!last) throw new Error("no observations with a value");
  const prevDate = addMonths(last.date, -1);
  const prev = valueAt(levels, prevDate);
  if (prev === null) throw new Error(`no level for ${prevDate.slice(0, 7)}; cannot compute the ${last.date.slice(0, 7)} change`);
  const value = clean((last.value! - prev) * 1000);
  const period = last.date.slice(0, 7);
  const out: Computed & { notes?: string } = {
    value,
    period,
    period_label: monthLabel(last.date),
    year_ago: null,
    year_ago_period: null,
    as_of: period,
    display: formatSignedCount(value),
  };
  // The 12 changes before the latest month telescope to (level[t-1] - level[t-13]) / 12.
  const start = valueAt(levels, addMonths(last.date, -13));
  if (start !== null) {
    const avg = Math.round((prev - start) / 12) * 1000;
    out.notes = `Prior 12-month average ${formatSignedCount(avg).replace(/^\+/, "")}.`;
  }
  return out;
}

const toAuto = (c: Computed & { notes?: string }, sourceUrl: string): AutoRecord => {
  const r: AutoRecord = {
    value: c.value,
    period: c.period,
    period_label: c.period_label,
    year_ago: null,
    year_ago_period: null,
    as_of: c.as_of,
    source_url: sourceUrl,
    stale: false,
    error: null,
  };
  if (c.display !== undefined) r.display = c.display;
  if (c.notes !== undefined) r.notes = c.notes;
  return r;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** FRED first, BLS only if the FRED path fails. Throws (caller marks stale) when both fail. */
export async function fetchPayrolls(opts: {
  fred: SeriesGetter;
  edition: string;
  env: Record<string, string | undefined>;
  http?: HttpOptions;
  saveRaw?: SaveRaw;
}): Promise<AutoRecord> {
  let fredError: string;
  try {
    return toAuto(computePayrollsChange(await opts.fred(PAYROLLS_FRED_SERIES)), fredSeriesUrl(PAYROLLS_FRED_SERIES));
  } catch (e) {
    fredError = msg(e);
  }
  try {
    const year = Number(opts.edition.slice(0, 4));
    const obs = await fetchBlsSeries({
      seriesId: PAYROLLS_BLS_SERIES,
      startYear: year - 2,
      endYear: year,
      apiKey: opts.env.BLS_API_KEY || undefined,
      http: opts.http,
      saveRaw: opts.saveRaw,
    });
    // Ignore months after the edition month, like the FRED observation window.
    const upTo = obs.filter((o) => o.date.slice(0, 7) <= opts.edition);
    return toAuto(computePayrollsChange(upTo), blsSeriesUrl(PAYROLLS_BLS_SERIES));
  } catch (e) {
    const f = fredError.startsWith("FRED") ? fredError : `FRED ${PAYROLLS_FRED_SERIES}: ${fredError}`;
    throw new Error(`${f}; BLS fallback: ${msg(e)}`);
  }
}
