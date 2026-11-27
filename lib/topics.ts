// Reader topic filters: each reader can hide topics they don't follow. The choice lives in
// the reader's own browser (localStorage); the page itself is identical for everyone.
// Elements carry data-topics="a b"; an element hides only when ALL of its topics are off.
// Elements without data-topics (headline tiles, key context, references) always show.

export const TOPICS = [
  { id: "houses", label: "Houses & flips" },
  { id: "land", label: "Land" },
  { id: "mh", label: "Manufactured homes" },
  { id: "rentals", label: "Rentals & multifamily" },
  { id: "commercial", label: "Office, industrial & retail" },
  { id: "rates", label: "Rates & markets" },
  { id: "jobs", label: "Jobs & AI" },
  { id: "credit", label: "Credit & foreclosures" },
  { id: "texas", label: "Texas metros & statewide" },
  { id: "europe", label: "Europe" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

/** Whole sections. Sections not listed (summary, key indicators, story, 20-year view, what to watch, references) always show. */
export const SECTION_TOPICS: Record<string, string> = {
  "jobs-ai": "jobs",
  credit: "credit",
  rates: "rates",
  gauges: "rates",
  housing: "houses mh",
  inventory: "houses land commercial",
  cre: "commercial",
  "tx-metros": "texas",
  texas: "texas",
  europe: "europe",
};

/** Investment cards, by the card's metric. */
export const CARD_TOPICS: Record<string, TopicId> = {
  median_existing_price: "houses",
  flip_gross_roi: "houses",
  builder_confidence: "houses",
  texas_land_price_acre: "land",
  us_median_rent: "rentals",
  mh_production_ytd: "mh",
  office_vacancy_cbre: "commercial",
  industrial_vacancy_cw: "commercial",
  foreclosure_filings_h1: "credit",
};

/** Key indicators table rows, by area, with per-metric overrides. */
export const AREA_TOPICS: Record<string, TopicId> = {
  Labor: "jobs",
  "Prices & rates": "rates",
  Housing: "houses",
  Commercial: "commercial",
  "Household credit": "credit",
  "Sentiment & AI": "jobs",
};
export const METRIC_TOPIC_OVERRIDES: Record<string, TopicId> = {
  mh_production_ytd: "mh",
};

/** Themes in "Reading the data together", in order. */
export const THEME_TOPICS: TopicId[] = ["houses", "houses", "jobs", "credit"];

export function inventoryRowTopic(type: string): TopicId {
  if (/^land/i.test(type)) return "land";
  if (/^commercial/i.test(type)) return "commercial";
  return "houses";
}

export const STORAGE_KEY = "som-hidden-topics";

/**
 * Applies the reader's saved choice by writing a <style> element (outside React's tree, so
 * hydration is unaffected): one display:none rule per distinct data-topics value whose topics
 * are all off. Inlined at the end of the page so hidden topics never flash in. Dependency-free.
 */
function applyTopicsImpl(hidden: string[], doc: Document) {
  const off: Record<string, 1> = {};
  hidden.forEach((t) => (off[t] = 1));
  const seen: Record<string, 1> = {};
  const rules: string[] = [];
  doc.querySelectorAll("[data-topics]").forEach((el) => {
    const v = el.getAttribute("data-topics") || "";
    if (!v || seen[v]) return;
    seen[v] = 1;
    if (v.split(" ").every((t) => off[t])) rules.push('[data-topics="' + v + '"]{display:none!important}');
  });
  let st = doc.getElementById("topic-filter-style");
  if (!st) {
    st = doc.createElement("style");
    st.id = "topic-filter-style";
    doc.head.appendChild(st);
  }
  st.textContent = rules.join("\n");
}

export function applyTopics(hidden: string[]) {
  applyTopicsImpl(hidden, document);
}

export const APPLY_TOPICS_SOURCE = `(function(){try{var h=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"[]");if(!Array.isArray(h))return;(${applyTopicsImpl.toString()})(h,document)}catch(e){}})();`;
