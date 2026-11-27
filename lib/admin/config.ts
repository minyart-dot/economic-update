// Server-only settings for the /admin form. SECURITY:
//   - Every value comes from server-side environment variables (Render > your service > Environment
//     Variables). None is NEXT_PUBLIC_, so nothing here is ever bundled for the browser.
//   - When any of them is missing, adminConfig() returns null and every /admin page and
//     /api/admin route answers 404, so the form is invisible until it is set up.
//
//   ADMIN_PASSWORD        the owner's password
//   ADMIN_SESSION_SECRET  random string (32+ characters) used to sign the session cookie
//   GITHUB_TOKEN          fine-grained token: this repository only; Contents read/write,
//                         Pull requests read-only (Metadata read-only is implied)
//   GITHUB_REPOSITORY     owner/repo
//   GITHUB_API_BASE       optional; defaults to https://api.github.com (tests point it at a stand-in)

export interface GitHubConfig {
  token: string;
  repo: string;
  apiBase: string;
}

export interface AdminConfig {
  password: string;
  sessionSecret: string;
  github: GitHubConfig;
}

export const MIN_SECRET_LENGTH = 32;

export function adminConfig(env: Record<string, string | undefined> = process.env): AdminConfig | null {
  const password = env.ADMIN_PASSWORD ?? "";
  const sessionSecret = env.ADMIN_SESSION_SECRET ?? "";
  const token = env.GITHUB_TOKEN ?? "";
  const repo = (env.GITHUB_REPOSITORY ?? "").trim();
  if (!password || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  if (sessionSecret.length < MIN_SECRET_LENGTH) return null;
  let apiBase = (env.GITHUB_API_BASE ?? "").trim() || "https://api.github.com";
  try {
    const u = new URL(apiBase);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    apiBase = apiBase.replace(/\/+$/, "");
  } catch {
    return null;
  }
  return { password, sessionSecret, github: { token, repo, apiBase } };
}
