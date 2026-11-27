// A tiny local stand-in for the parts of the GitHub REST API the admin form uses
// (lib/admin/github.ts). Point GITHUB_API_BASE (or GitHubConfig.apiBase) at it.
// Not a test file itself; used by tests/admin-github.test.ts and for running the app locally.

import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  auth: string | undefined;
}

export const blobSha = (text: string) => {
  const buf = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
};

export interface StandIn {
  url: string;
  requests: RecordedRequest[];
  /** branch -> path -> text */
  files: Map<string, Map<string, string>>;
  pulls: { number: number; head: string; html_url: string; title: string }[];
  comments: Map<number, { body: string; html_url: string; updated_at: string }[]>;
  setFile(branch: string, path: string, text: string): void;
  getFile(branch: string, path: string): string | undefined;
  close(): Promise<void>;
}

export async function startGitHubStandIn(opts: { token: string; repo: string; port?: number }): Promise<StandIn> {
  const files = new Map<string, Map<string, string>>();
  const requests: RecordedRequest[] = [];
  const pulls: StandIn["pulls"] = [];
  const comments: StandIn["comments"] = new Map();
  let commits = 0;
  const prefix = `/repos/${opts.repo}`;

  const send = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://stand-in");
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      const path = decodeURIComponent(u.pathname);
      requests.push({ method: req.method ?? "", path, query: Object.fromEntries(u.searchParams), body, auth: req.headers.authorization });

      if (req.headers.authorization !== `Bearer ${opts.token}`) return send(res, 401, { message: "Bad credentials" });
      if (!path.startsWith(prefix + "/")) return send(res, 404, { message: "Not Found" });
      const rest = path.slice(prefix.length);

      if (req.method === "GET" && rest.startsWith("/git/matching-refs/heads/")) {
        const want = rest.slice("/git/matching-refs/heads/".length);
        const refs = [...files.keys()].filter((b) => b.startsWith(want)).map((b) => ({ ref: `refs/heads/${b}`, object: { sha: "0".repeat(40) } }));
        return send(res, 200, refs);
      }
      if (rest.startsWith("/contents/")) {
        const p = rest.slice("/contents/".length);
        if (req.method === "GET") {
          const branch = u.searchParams.get("ref") ?? "main";
          const text = files.get(branch)?.get(p);
          if (text === undefined) return send(res, 404, { message: "Not Found" });
          return send(res, 200, { type: "file", path: p, sha: blobSha(text), encoding: "base64", content: Buffer.from(text).toString("base64") });
        }
        if (req.method === "PUT") {
          const b = body as { message?: string; content?: string; sha?: string; branch?: string };
          const branch = b.branch ?? "main";
          const cur = files.get(branch)?.get(p);
          if (!files.has(branch)) return send(res, 404, { message: "Branch not found" });
          if (cur !== undefined && b.sha !== blobSha(cur)) return send(res, 409, { message: `${p} does not match ${b.sha}` });
          const text = Buffer.from(b.content ?? "", "base64").toString("utf8");
          files.get(branch)!.set(p, text);
          commits++;
          const sha = createHash("sha1").update(`commit ${commits}`).digest("hex");
          return send(res, 200, {
            content: { path: p, sha: blobSha(text) },
            commit: { sha, html_url: `https://github.com/${opts.repo}/commit/${sha}`, message: b.message },
          });
        }
      }
      if (req.method === "GET" && rest === "/pulls") {
        const head = u.searchParams.get("head") ?? "";
        const branch = head.includes(":") ? head.split(":")[1] : head;
        return send(res, 200, pulls.filter((p) => !head || p.head === branch));
      }
      const cm = rest.match(/^\/issues\/(\d+)\/comments$/);
      if (req.method === "GET" && cm) {
        const page = Number(u.searchParams.get("page") ?? 1);
        const per = Number(u.searchParams.get("per_page") ?? 30);
        const all = comments.get(Number(cm[1])) ?? [];
        return send(res, 200, all.slice((page - 1) * per, page * per));
      }
      return send(res, 404, { message: "Not Found" });
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    files,
    pulls,
    comments,
    setFile(branch, path, text) {
      if (!files.has(branch)) files.set(branch, new Map());
      files.get(branch)!.set(path, text);
    },
    getFile: (branch, path) => files.get(branch)?.get(path),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
