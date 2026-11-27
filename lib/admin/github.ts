// Minimal GitHub REST client for the admin form (plain fetch, no SDK). Server-side only: the token
// is read from GITHUB_TOKEN (lib/admin/config.ts) and never sent to the browser.
//
// SECURITY: the only write is putManualFile(), which builds the branch and path from an edition id
// and runs assertWritable() before the request, so it can only ever change
// data/manual/YYYY-MM.yaml on edition/YYYY-MM. Writes send the file's previous blob sha, so GitHub
// rejects them (409) if someone else saved the file in the meantime.

import type { GitHubConfig } from "./config";
import { assertWritable, editionBranch, editionOfBranch, manualPath } from "./paths";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** The file changed on the branch since it was loaded. */
export class ConflictError extends Error {
  constructor(message = "Someone else saved this file after you opened it. Reload the page to get the latest version.") {
    super(message);
    this.name = "ConflictError";
  }
}

const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function gh<T>(cfg: GitHubConfig, method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "state-of-the-market-admin",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function fail(what: string, status: number, data: unknown): never {
  const msg = (data as { message?: string } | null)?.message ?? "";
  if (status === 401) throw new GitHubError(`${what}: GitHub rejected the token (check GITHUB_TOKEN).`, status);
  if (status === 403) throw new GitHubError(`${what}: the token lacks permission or hit a rate limit. ${msg}`.trim(), status);
  throw new GitHubError(`${what}: GitHub answered ${status}. ${msg}`.trim(), status);
}

const repoPath = (cfg: GitHubConfig) => `/repos/${cfg.repo.split("/").map(encodeURIComponent).join("/")}`;

/** Edition ids that have an edition/YYYY-MM branch, newest first. */
export async function listEditionBranches(cfg: GitHubConfig): Promise<string[]> {
  const { status, data } = await gh<{ ref: string }[]>(cfg, "GET", `${repoPath(cfg)}/git/matching-refs/heads/edition/?per_page=100`);
  if (status !== 200 || !Array.isArray(data)) fail("Listing edition branches", status, data);
  return data
    .map((r) => editionOfBranch(String(r.ref ?? "").replace(/^refs\/heads\//, "")))
    .filter((id): id is string => !!id)
    .sort()
    .reverse();
}

export interface RepoFile {
  text: string;
  sha: string;
}

/** A text file on a branch, or null when it does not exist there. */
export async function getFile(cfg: GitHubConfig, branch: string, path: string): Promise<RepoFile | null> {
  const { status, data } = await gh<{ sha?: string; content?: string; encoding?: string; type?: string }>(
    cfg,
    "GET",
    `${repoPath(cfg)}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (status === 404) return null;
  if (status !== 200 || !data || data.type !== "file" || typeof data.sha !== "string") fail(`Reading ${path}`, status, data);
  if (data.encoding !== "base64" || typeof data.content !== "string") throw new GitHubError(`Reading ${path}: unexpected encoding.`, 502);
  return { text: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

export const getManualFile = (cfg: GitHubConfig, id: string) => getFile(cfg, editionBranch(id), manualPath(id));

export interface SaveResult {
  commitSha: string;
  commitUrl: string;
  fileSha: string;
}

/** Writes data/manual/<id>.yaml on edition/<id>. `sha` is the blob sha the edit was based on. */
export async function putManualFile(cfg: GitHubConfig, id: string, text: string, sha: string): Promise<SaveResult> {
  const branch = editionBranch(id);
  const path = manualPath(id);
  assertWritable(branch, path);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new ConflictError("The page is missing the file version. Reload the page.");
  const { status, data } = await gh<{ commit?: { sha?: string; html_url?: string }; content?: { sha?: string }; message?: string }>(
    cfg,
    "PUT",
    `${repoPath(cfg)}/contents/${encPath(path)}`,
    {
      message: `Manual values for ${id} (admin form)`,
      content: Buffer.from(text, "utf8").toString("base64"),
      sha,
      branch,
    },
  );
  // 409: sha does not match the file on the branch. 422 is also used for a stale/missing sha.
  if (status === 409 || (status === 422 && /sha/i.test(data?.message ?? ""))) throw new ConflictError();
  if ((status !== 200 && status !== 201) || !data?.commit?.sha) fail(`Saving ${path}`, status, data);
  return {
    commitSha: data.commit.sha,
    commitUrl: data.commit.html_url ?? `https://github.com/${cfg.repo}/commit/${data.commit.sha}`,
    fileSha: data.content?.sha ?? "",
  };
}

export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
}

/** The open PR whose head is edition/<id>, if any. */
export async function findPullRequest(cfg: GitHubConfig, id: string): Promise<PullRequestInfo | null> {
  const owner = cfg.repo.split("/")[0];
  const head = encodeURIComponent(`${owner}:${editionBranch(id)}`);
  const { status, data } = await gh<{ number: number; html_url: string; title: string }[]>(cfg, "GET", `${repoPath(cfg)}/pulls?state=open&head=${head}&per_page=5`);
  if (status !== 200 || !Array.isArray(data)) fail("Finding the review PR", status, data);
  const pr = data[0];
  return pr ? { number: pr.number, url: pr.html_url, title: pr.title } : null;
}

/** Marker the monthly workflow puts at the top of its validation comment (scripts/edition-pr-body.ts). */
export const VALIDATION_MARKER = "<!-- state-of-the-market:validation -->";

export interface ValidationComment {
  body: string;
  url: string;
  updatedAt: string;
}

/** The workflow's validation comment on the PR (the newest one carrying the marker). */
export async function findValidationComment(cfg: GitHubConfig, prNumber: number): Promise<ValidationComment | null> {
  let found: ValidationComment | null = null;
  for (let page = 1; page <= 5; page++) {
    const { status, data } = await gh<{ body?: string; html_url: string; updated_at: string }[]>(
      cfg,
      "GET",
      `${repoPath(cfg)}/issues/${prNumber}/comments?per_page=100&page=${page}`,
    );
    if (status !== 200 || !Array.isArray(data)) fail("Reading the PR comments", status, data);
    for (const c of data) {
      if (typeof c.body === "string" && c.body.startsWith(VALIDATION_MARKER) && (!found || c.updated_at > found.updatedAt)) {
        found = { body: c.body.slice(VALIDATION_MARKER.length).trim(), url: c.html_url, updatedAt: c.updated_at };
      }
    }
    if (data.length < 100) break;
  }
  return found;
}
