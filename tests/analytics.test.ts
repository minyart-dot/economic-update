// Spec Phase 3 acceptance: the correlations in Section 6.3 are reproduced from data/history.

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCorrelations } from "../lib/analytics";
import { loadTexasAnnual, loadUsAnnual } from "../lib/data";

test("correlations match spec Section 6.3", () => {
  const byId = Object.fromEntries(computeCorrelations(loadUsAnnual(), loadTexasAnnual()).map((c) => [c.id, c]));
  assert.equal(byId.unemp_foreclosures.r, 0.75);
  assert.equal(byId.unemp_permits.r, -0.78);
  assert.equal(byId.permits_lead_unemp.r, -0.52);
  assert.equal(byId.permits_lead_unemp.n, 18);
  assert.equal(byId.unemp_card.r, 0.62); // excluding 2020–21
  assert.equal(byId.unemp_card.n, 18);
  assert.match(byId.unemp_card.note!, /\+0\.52 with them/);
  assert.equal(byId.tx_us_permits.r, 0.95);
  assert.equal(byId.unemp_foreclosures.n, 20);
});
