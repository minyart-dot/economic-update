// Builds what the /admin page shows from the files on the edition branch.

import { load } from "js-yaml";
import type { MetricsFile } from "@/lib/types";
import type { ManualFile } from "@/scripts/lib/io";
import type { FieldMeta } from "./fields";
import { asText, formFromEntry } from "./fields";

/**
 * Area of each metric, from the "# ------ Area" divider comments in data/config/metrics.yaml
 * (Labor, Prices and rates, Housing (U.S.), ...), in file order.
 */
export function metricAreas(metricsYaml: string): { areaOf: Record<string, string>; order: string[] } {
  const areaOf: Record<string, string> = {};
  const order: string[] = [];
  let area = "Other";
  for (const line of metricsYaml.split(/\r?\n/)) {
    const d = line.match(/^ {2}# -{4,}\s*(.+?)\s*$/);
    if (d) {
      area = d[1];
      if (!order.includes(area)) order.push(area);
      continue;
    }
    const m = line.match(/^ {2}([A-Za-z0-9_.-]+):\s*(#.*)?$/);
    if (m) areaOf[m[1]] = area;
  }
  return { areaOf, order };
}

export interface FieldGroup {
  area: string;
  fields: FieldMeta[];
}

/** One FieldMeta per entry in the manual file, grouped by area in metrics.yaml order. */
export function buildFieldGroups(manual: ManualFile, metricsYaml: string | null): FieldGroup[] {
  let cfg: MetricsFile["metrics"] = {};
  let areas = { areaOf: {} as Record<string, string>, order: [] as string[] };
  if (metricsYaml) {
    try {
      cfg = ((load(metricsYaml) as MetricsFile | null)?.metrics ?? {}) as MetricsFile["metrics"];
    } catch {
      cfg = {};
    }
    areas = metricAreas(metricsYaml);
  }
  const groups = new Map<string, FieldMeta[]>();
  for (const [id, e] of Object.entries(manual.metrics)) {
    const c = cfg[id];
    const area = areas.areaOf[id] ?? "Other";
    const meta: FieldMeta = {
      id,
      label: asText(e.label) || c?.label || id,
      area,
      required: e.required ?? c?.required ?? false,
      unit: c?.unit ?? "",
      expected_release: asText(e.expected_release),
      notes: asText(e.notes),
      footnote: asText(e.footnote),
      has_display: e.display !== undefined,
      has_year_ago_display: e.year_ago_display !== undefined,
      has_change_reported: e.change_reported !== undefined,
      current: formFromEntry(e),
    };
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)!.push(meta);
  }
  const rank = (a: string) => (areas.order.includes(a) ? areas.order.indexOf(a) : areas.order.length);
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([area, fields]) => ({ area, fields }));
}
