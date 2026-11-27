// Log of between-edition volatility alerts, data/alerts.json (spec Section 9). Written by
// scripts/vix-alert.ts after a send; read at build time for the "Last alert" line on the gauges section.

import fs from "node:fs";
import path from "node:path";
import type { AlertLevel } from "./types";

export interface AlertLogEntry {
  /** Date of the VIX close that triggered the alert (YYYY-MM-DD). */
  date: string;
  vix: number;
  level: AlertLevel;
  threshold: number;
  /** ISO timestamp of the send. */
  sent_at: string;
  mode: "send";
}

export const alertLogPath = (root = process.cwd()) => path.join(root, "data", "alerts.json");

/** Reads data/alerts.json; a missing file is an empty log, a malformed one is an error. */
export function loadAlertLog(root = process.cwd()): AlertLogEntry[] {
  const file = alertLogPath(root);
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${file} must be a JSON array`);
  return raw as AlertLogEntry[];
}

/** The most recent alert that was actually sent, or null. */
export function lastSentAlert(log: AlertLogEntry[]): AlertLogEntry | null {
  const sent = log.filter((e) => e.mode === "send" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(e.vix));
  sent.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sent_at < b.sent_at ? -1 : 1));
  return sent.at(-1) ?? null;
}

/** "Nov 27, 2026" from "2026-11-27". */
export function longDateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Last alert: Nov 27, 2026 (VIX 33.10)", or null when no alert was ever sent. */
export function lastAlertLine(root = process.cwd()): string | null {
  const last = lastSentAlert(loadAlertLog(root));
  return last ? `Last alert: ${longDateLabel(last.date)} (VIX ${last.vix.toFixed(2)})` : null;
}
