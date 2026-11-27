// Freezes data/history/* into data/editions/YYYY-MM.history.json so a published edition's charts
// and correlations never change when history is appended. Run automatically by the publish flow;
// manual use: npm run freeze-history -- 2026-11 [--force]
import { freezeHistory, historySnapshotPath, listEditions } from "../lib/data";

const id = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a));
if (!id || !listEditions().includes(id)) {
  console.error("Usage: npm run freeze-history -- YYYY-MM [--force]  (edition must exist in data/editions/)");
  process.exit(1);
}
const wrote = freezeHistory(id, process.argv.includes("--force"));
console.log(wrote ? `Wrote ${historySnapshotPath(id)}` : `${historySnapshotPath(id)} already exists; pass --force to replace it.`);
