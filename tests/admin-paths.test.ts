// Admin form: it may only ever write data/manual/YYYY-MM.yaml on edition/YYYY-MM.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { putManualFile } from "../lib/admin/github";
import { WriteNotAllowed, assertWritable, editionBranch, editionOfBranch, manualPath } from "../lib/admin/paths";
import { type StandIn, blobSha, startGitHubStandIn } from "./github-stand-in";

test("allow-list: the edition's own manual file on its own branch", () => {
  assert.doesNotThrow(() => assertWritable("edition/2026-12", "data/manual/2026-12.yaml"));
  assert.equal(editionBranch("2026-12"), "edition/2026-12");
  assert.equal(manualPath("2026-12"), "data/manual/2026-12.yaml");
  assert.equal(editionOfBranch("edition/2027-01"), "2027-01");
});

test("allow-list: never main, other branches, other paths or another month", () => {
  const bad: [string, string][] = [
    ["main", "data/manual/2026-12.yaml"],
    ["master", "data/manual/2026-12.yaml"],
    ["refs/heads/edition/2026-12", "data/manual/2026-12.yaml"],
    ["edition/2026-13", "data/manual/2026-13.yaml"],
    ["edition/2026-12-x", "data/manual/2026-12.yaml"],
    ["edition/2026-12/../main", "data/manual/2026-12.yaml"],
    ["feature/edition/2026-12", "data/manual/2026-12.yaml"],
    ["edition/2026-12", "data/manual/2026-11.yaml"],
    ["edition/2026-12", "data/editions/2026-12.json"],
    ["edition/2026-12", "data/config/metrics.yaml"],
    ["edition/2026-12", ".github/workflows/monthly-update.yml"],
    ["edition/2026-12", "data/manual/2026-12.yml"],
    ["edition/2026-12", "data/manual/../config/metrics.yaml"],
    ["edition/2026-12", "/data/manual/2026-12.yaml"],
    ["edition/2026-12", "data/manual/2026-12.yaml/x"],
  ];
  for (const [b, p] of bad) assert.throws(() => assertWritable(b, p), WriteNotAllowed, `${b} ${p}`);
  for (const id of ["2026-13", "2026-1", "../main", "2026-12/../x", "", "main"]) {
    assert.throws(() => editionBranch(id), WriteNotAllowed, id);
    assert.throws(() => manualPath(id), WriteNotAllowed, id);
  }
});

let gh: StandIn;
const cfg = () => ({ token: "t0ken", repo: "owner/repo", apiBase: gh.url });
before(async () => {
  gh = await startGitHubStandIn({ token: "t0ken", repo: "owner/repo" });
  gh.setFile("main", "data/manual/2026-12.yaml", "edition: main\n");
  gh.setFile("edition/2026-12", "data/manual/2026-12.yaml", "edition: x\nmetrics: {}\n");
});
after(() => gh.close());

test("putManualFile: refuses bad ids before any request is made", async () => {
  for (const id of ["main", "../main", "2026-13", "2026-12/../../x"]) {
    await assert.rejects(putManualFile(cfg(), id, "x", "0".repeat(40)), WriteNotAllowed);
  }
  assert.equal(gh.requests.length, 0);
});

test("putManualFile: one PUT to the manual file on the edition branch, never main", async () => {
  const sha = blobSha("edition: x\nmetrics: {}\n");
  const res = await putManualFile(cfg(), "2026-12", "edition: y\nmetrics: {}\n", sha);
  assert.match(res.commitSha, /^[0-9a-f]{40}$/);
  const puts = gh.requests.filter((r) => r.method !== "GET");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].method, "PUT");
  assert.equal(puts[0].path, "/repos/owner/repo/contents/data/manual/2026-12.yaml");
  const body = puts[0].body as Record<string, string>;
  assert.equal(body.branch, "edition/2026-12");
  assert.equal(body.sha, sha);
  assert.equal(body.message, "Manual values for 2026-12 (admin form)");
  assert.equal(puts[0].auth, "Bearer t0ken");
  assert.equal(gh.getFile("main", "data/manual/2026-12.yaml"), "edition: main\n", "main untouched");
});
