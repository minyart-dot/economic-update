// Shared helpers for the pipeline tests. The fixture under tests/fixtures/pipeline is SYNTHETIC.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FIXTURE = path.join(__dirname, "fixtures", "pipeline");

/** Copy the synthetic fixture to a fresh temp dir so a test can modify it freely. */
export function tempFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sotm-test-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

export function writeFile(root: string, rel: string, content: string): void {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
