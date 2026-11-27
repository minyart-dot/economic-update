// The admin form's write allow-list. SECURITY: the form may only ever write
// data/manual/YYYY-MM.yaml on branch edition/YYYY-MM (same month). Never main, never another
// branch, never another path. lib/admin/github.ts calls assertWritable() right before every write,
// so this is the single place that decides; tests/admin-paths.test.ts pins it down.

import { EDITION_ID_RE } from "./fields";

export const EDITION_BRANCH_RE = /^edition\/(\d{4}-(0[1-9]|1[0-2]))$/;

export class WriteNotAllowed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteNotAllowed";
  }
}

export function assertEditionId(id: string): string {
  if (typeof id !== "string" || !EDITION_ID_RE.test(id)) throw new WriteNotAllowed(`"${id}" is not an edition id like 2026-12.`);
  return id;
}

export const editionBranch = (id: string) => `edition/${assertEditionId(id)}`;
export const manualPath = (id: string) => `data/manual/${assertEditionId(id)}.yaml`;

/** Edition id of an edition/YYYY-MM branch name, or null for any other branch. */
export function editionOfBranch(branch: string): string | null {
  const m = typeof branch === "string" ? EDITION_BRANCH_RE.exec(branch) : null;
  return m ? m[1] : null;
}

/** Throws unless `path` is exactly data/manual/<id>.yaml and `branch` is exactly edition/<id>. */
export function assertWritable(branch: string, path: string): void {
  const id = editionOfBranch(branch);
  if (!id) throw new WriteNotAllowed(`Writing to branch "${branch}" is not allowed (only edition/YYYY-MM).`);
  if (path !== `data/manual/${id}.yaml`) {
    throw new WriteNotAllowed(`Writing "${path}" on ${branch} is not allowed (only data/manual/${id}.yaml).`);
  }
}
