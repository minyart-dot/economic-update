// /admin — the owner's form for the monthly hand-entered numbers (spec 11.2, 15 item 6).
// Reads data/manual/YYYY-MM.yaml from the edition/YYYY-MM branch through the GitHub API and
// saves it back through POST /api/admin/save. Server-rendered after a session check; the GitHub
// token stays on the server (only field values, the file sha and links reach the browser).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminConfig } from "@/lib/admin/config";
import { EDITION_ID_RE } from "@/lib/admin/fields";
import {
  type PullRequestInfo,
  type ValidationComment,
  findPullRequest,
  findValidationComment,
  getFile,
  getManualFile,
  listEditionBranches,
} from "@/lib/admin/github";
import { hasValidSession } from "@/lib/admin/guard";
import { parseManual } from "@/lib/admin/manual-yaml";
import { buildFieldGroups } from "@/lib/admin/model";
import { editionBranch } from "@/lib/admin/paths";
import { editionLabel } from "@/scripts/lib/io";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border border-l-4 border-l-orange bg-white p-4">
      <h2 className="font-semibold text-ink">{title}</h2>
      <div className="mt-1 text-sm text-dark">{children}</div>
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edition?: string }> }) {
  const cfg = adminConfig();
  if (!cfg) notFound(); // invisible until ADMIN_PASSWORD, ADMIN_SESSION_SECRET, GITHUB_TOKEN, GITHUB_REPOSITORY are set
  if (!(await hasValidSession(cfg))) redirect("/admin/login");
  const gh = cfg.github;
  const { edition: asked } = await searchParams;

  let body: React.ReactNode;
  try {
    const editions = await listEditionBranches(gh);
    const edition = asked && EDITION_ID_RE.test(asked) && editions.includes(asked) ? asked : editions[0];
    if (!edition) {
      body = (
        <Notice title="No edition is open for review">
          There is no <code>edition/YYYY-MM</code> branch yet. The monthly workflow creates one on the 25th (or run Actions &gt;
          “Monthly edition update” by hand).
        </Notice>
      );
    } else {
      const [file, metricsYaml, pr] = await Promise.all([
        getManualFile(gh, edition),
        getFile(gh, editionBranch(edition), "data/config/metrics.yaml").catch(() => null),
        findPullRequest(gh, edition).catch(() => null as PullRequestInfo | null),
      ]);
      const comment: ValidationComment | null = pr ? await findValidationComment(gh, pr.number).catch(() => null) : null;
      if (!file) {
        body = (
          <Notice title={`No manual file for ${editionLabel(edition)}`}>
            <code>data/manual/{edition}.yaml</code> is not on the <code>{editionBranch(edition)}</code> branch. Re-run the
            monthly workflow for {edition} to create it.
          </Notice>
        );
      } else {
        const groups = buildFieldGroups(parseManual(file.text), metricsYaml?.text ?? null);
        body = (
          <AdminForm
            key={`${edition}:${file.sha}`}
            edition={edition}
            editionLabel={editionLabel(edition)}
            editions={editions}
            sha={file.sha}
            groups={groups}
            pr={pr}
            comment={comment ? { body: comment.body.slice(0, 6000), url: comment.url, updatedAt: comment.updatedAt } : null}
            branchUrl={`https://github.com/${gh.repo}/tree/${editionBranch(edition)}`}
            fileUrl={`https://github.com/${gh.repo}/blob/${editionBranch(edition)}/data/manual/${edition}.yaml`}
          />
        );
      }
    }
  } catch (e) {
    console.error("admin page:", (e as Error).message);
    body = (
      <Notice title="Could not load the data from GitHub">
        <p>{(e as Error).message}</p>
        <p className="mt-2">
          Check GITHUB_TOKEN and GITHUB_REPOSITORY in the Vercel settings, then{" "}
          <Link href="/admin" className="source-link">
            reload
          </Link>
          .
        </p>
      </Notice>
    );
  }

  return (
    <>
      <AdminHeader signedIn />
      <main id="main" className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {body}
      </main>
    </>
  );
}
