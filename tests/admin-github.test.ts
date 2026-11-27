// Admin form against a local GitHub stand-in: reading branches and files, saving with the sha,
// conflicts, validation before writing, PR and validation-comment lookup.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { load as yamlLoad } from "js-yaml";
import type { FieldForm } from "../lib/admin/fields";
import {
  ConflictError,
  GitHubError,
  VALIDATION_MARKER,
  findPullRequest,
  findValidationComment,
  getManualFile,
  listEditionBranches,
  putManualFile,
} from "../lib/admin/github";
import { parseSaveRequest, saveManual } from "../lib/admin/save";
import type { ManualFile } from "../scripts/lib/io";
import { type StandIn, blobSha, startGitHubStandIn } from "./github-stand-in";

const TOKEN = "github_pat_test";
const REPO = "owner/repo";
const FILE = `# Manual figures for the December 2026 edition (2026-12).
# HOW TO FILL THIS IN ...

edition: "2026-12"
metrics:
  # Builder confidence · MANUAL · entered by hand · REQUIRED
  hmi:
    label: "Builder confidence (HMI)"
    required: true
    stale: true            # set to false once this month's number is entered
    value: 37
    period: "2026-10"
    period_label: "Oct"
    year_ago: 43
    year_ago_period: "2025-10"
    as_of: "2026-10"
    source_url: "https://www.nahb.org/news-and-economics/housing-economics/indices/housing-market-index"
    expected_release: "NAHB, ~mid-month"
    carry_forward: false
    carry_forward_reason: ""

  # Recent-graduate unemployment · MANUAL · entered by hand
  grad_unemployment:
    label: "Recent-graduate unemployment"
    required: false
    stale: true            # set to false once this month's number is entered
    value: 5.8
    period: "2026-Q2"
    period_label: "Q2"
    year_ago: 5.3
    year_ago_period: "2025-Q2"
    as_of: "2026-Q2"
    source_url: "https://www.newyorkfed.org/research/college-labor-market"
    expected_release: "NY Fed, quarterly"
    carry_forward: false
    carry_forward_reason: ""
`;

const blank: FieldForm = {
  status: "stale", value: "", display: "", period: "", period_label: "", as_of: "", year_ago: "",
  year_ago_display: "", year_ago_period: "", change_pct: "", change_points: "", source_url: "", reason: "",
};

let gh: StandIn | null = null;
const cfg = () => ({ token: TOKEN, repo: REPO, apiBase: gh!.url });

beforeEach(async () => {
  await gh?.close();
  gh = await startGitHubStandIn({ token: TOKEN, repo: REPO });
  gh.setFile("main", "README.md", "x");
  gh.setFile("edition/2026-11", "data/manual/2026-11.yaml", "metrics: {}\n");
  gh.setFile("edition/2026-12", "data/manual/2026-12.yaml", FILE);
  gh.setFile("edition/not-a-month", "x", "x");
  gh.pulls.push({ number: 7, head: "edition/2026-12", html_url: "https://github.com/owner/repo/pull/7", title: "Edition 2026-12: review & publish" });
});
after(() => gh?.close());

test("github: lists edition branches newest first, ignoring others", async () => {
  assert.deepEqual(await listEditionBranches(cfg()), ["2026-12", "2026-11"]);
});

test("github: reads the manual file from the edition branch with its sha", async () => {
  const f = await getManualFile(cfg(), "2026-12");
  assert.ok(f);
  assert.equal(f.text, FILE);
  assert.equal(f.sha, blobSha(FILE));
  const req = gh!.requests.at(-1)!;
  assert.equal(req.path, "/repos/owner/repo/contents/data/manual/2026-12.yaml");
  assert.equal(req.query.ref, "edition/2026-12");
  assert.equal(await getManualFile(cfg(), "2027-01"), null);
});

test("github: a bad token is reported clearly", async () => {
  await assert.rejects(listEditionBranches({ ...cfg(), token: "wrong" }), (e: unknown) => e instanceof GitHubError && e.status === 401 && /GITHUB_TOKEN/.test(e.message));
});

test("save: commits only the changed lines, with the old sha, to edition/2026-12", async () => {
  const out = await saveManual(cfg(), {
    edition: "2026-12",
    sha: blobSha(FILE),
    fields: {
      hmi: { ...blank, status: "updated", value: "38", period: "2026-11", period_label: "Nov", as_of: "2026-11", year_ago: "46", year_ago_period: "2025-11" },
      grad_unemployment: { ...blank, status: "carry", reason: "Quarterly; Q3 out Dec 4" },
    },
  });
  assert.equal(out.kind, "saved");
  if (out.kind !== "saved") return;
  assert.deepEqual(out.changed.sort(), ["grad_unemployment", "hmi"]);
  assert.equal(out.inPlace, true);
  assert.equal(out.prUrl, "https://github.com/owner/repo/pull/7");

  const puts = gh!.requests.filter((r) => r.method === "PUT");
  assert.equal(puts.length, 1);
  const body = puts[0].body as { message: string; content: string; sha: string; branch: string };
  assert.equal(puts[0].path, "/repos/owner/repo/contents/data/manual/2026-12.yaml");
  assert.equal(body.branch, "edition/2026-12");
  assert.equal(body.sha, blobSha(FILE));
  assert.equal(body.message, "Manual values for 2026-12 (admin form)");
  const text = Buffer.from(body.content, "base64").toString("utf8");
  assert.equal(text, gh!.getFile("edition/2026-12", "data/manual/2026-12.yaml"));
  assert.ok(text.startsWith("# Manual figures for the December 2026 edition"));
  assert.match(text, /# Builder confidence · MANUAL · entered by hand · REQUIRED/);
  const y = yamlLoad(text) as ManualFile;
  assert.equal(y.metrics.hmi.stale, false);
  assert.equal(y.metrics.hmi.value, 38);
  assert.equal(y.metrics.hmi.year_ago_period, "2025-11");
  assert.equal(y.metrics.grad_unemployment.carry_forward, true);
  assert.equal(y.metrics.grad_unemployment.value, 5.8, "carry forward keeps the old number");
  assert.equal(out.fileSha, blobSha(text));
});

test("save: a changed sha means someone else saved -> conflict, nothing written", async () => {
  const oldSha = blobSha(FILE);
  gh!.setFile("edition/2026-12", "data/manual/2026-12.yaml", FILE.replace("value: 37", "value: 39"));
  const out = await saveManual(cfg(), { edition: "2026-12", sha: oldSha, fields: { grad_unemployment: { ...blank, status: "carry", reason: "x" } } });
  assert.equal(out.kind, "conflict");
  assert.equal(gh!.requests.filter((r) => r.method === "PUT").length, 0);
  // And if the file changes between our read and our write, GitHub's 409 becomes a ConflictError.
  await assert.rejects(putManualFile(cfg(), "2026-12", "metrics: {}\n", oldSha), ConflictError);
  assert.match(gh!.getFile("edition/2026-12", "data/manual/2026-12.yaml")!, /value: 39/);
});

test("save: invalid input is rejected before anything is written", async () => {
  const out = await saveManual(cfg(), {
    edition: "2026-12",
    sha: blobSha(FILE),
    fields: {
      hmi: { ...blank, status: "updated", value: "38%", period: "Nov 2026", period_label: "Nov", as_of: "2026-11" },
      grad_unemployment: { ...blank, status: "carry", reason: "" },
      nope: { ...blank },
    },
  });
  assert.equal(out.kind, "invalid");
  if (out.kind !== "invalid") return;
  assert.ok(out.errors.hmi.value && out.errors.hmi.period);
  assert.ok(out.errors.grad_unemployment.reason);
  assert.ok(out.errors.nope.status);
  assert.equal(gh!.requests.filter((r) => r.method === "PUT").length, 0);
});

test("save: nothing changed -> no commit", async () => {
  const out = await saveManual(cfg(), { edition: "2026-12", sha: blobSha(FILE), fields: { hmi: { ...blank, source_url: "" } } });
  assert.equal(out.kind, "unchanged");
  assert.equal(gh!.requests.filter((r) => r.method === "PUT").length, 0);
});

test("save: request shape is checked", () => {
  assert.equal(parseSaveRequest(null), null);
  assert.equal(parseSaveRequest({ edition: "main", sha: "x", fields: {} }), null);
  assert.equal(parseSaveRequest({ edition: "2026-12", sha: "x", fields: { hmi: { value: 5 } } }), null, "non-string field");
  assert.equal(parseSaveRequest({ edition: "2026-12", sha: "x", fields: { "../x": {} } }), null);
  const ok = parseSaveRequest({ edition: "2026-12", sha: "x", fields: { hmi: { status: "stale", extra: "ignored" } } });
  assert.ok(ok);
  assert.equal(ok.fields.hmi.value, "");
  assert.equal("extra" in ok.fields.hmi, false);
});

test("github: finds the review PR and its latest validation comment", async () => {
  assert.equal((await findPullRequest(cfg(), "2026-12"))?.number, 7);
  assert.equal(await findPullRequest(cfg(), "2026-11"), null);
  const head = gh!.requests.find((r) => r.path.endsWith("/pulls"))!.query.head;
  assert.equal(head, "owner:edition/2026-12");
  gh!.comments.set(7, [
    { body: "Looks good", html_url: "u1", updated_at: "2026-11-25T10:00:00Z" },
    { body: `${VALIDATION_MARKER}\n## Validation: 2 warnings`, html_url: "u2", updated_at: "2026-11-26T10:00:00Z" },
  ]);
  const c = await findValidationComment(cfg(), 7);
  assert.equal(c?.url, "u2");
  assert.equal(c?.body, "## Validation: 2 warnings");
  assert.equal(await findValidationComment(cfg(), 99), null);
});
