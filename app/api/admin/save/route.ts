// POST /api/admin/save — validates the admin form and commits data/manual/YYYY-MM.yaml to the
// edition/YYYY-MM branch through the GitHub API (lib/admin/save.ts). Requires a valid session and a
// same-origin request; 404 when the admin form is not configured. The push starts the monthly
// workflow, which rebuilds, re-validates and refreshes the PR comment.

import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE, requireAdminApi } from "@/lib/admin/guard";
import { ManualFileError } from "@/lib/admin/manual-yaml";
import { WriteNotAllowed } from "@/lib/admin/paths";
import { clientIp, createRateLimiter } from "@/lib/admin/rate-limit";
import { parseSaveRequest, saveManual } from "@/lib/admin/save";

const saves = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req, { mutating: true });
  if ("response" in auth) return auth.response;
  if (saves.hit(clientIp(req.headers))) return json({ ok: false, message: "Too many saves. Wait a few minutes and try again." }, 429);

  if (Number(req.headers.get("content-length") ?? 0) > 500_000) return json({ ok: false, message: "Request too large." }, 413);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Bad request." }, 400);
  }
  const request = parseSaveRequest(body);
  if (!request) return json({ ok: false, message: "Bad request." }, 400);

  try {
    const out = await saveManual(auth.cfg.github, request);
    switch (out.kind) {
      case "saved":
        return json({ ok: true, ...out }, 200);
      case "unchanged":
        return json({ ok: true, kind: "unchanged", message: "Nothing changed, so nothing was saved." }, 200);
      case "invalid":
        return json({ ok: false, kind: "invalid", message: out.message, errors: out.errors }, 422);
      case "conflict":
        return json({ ok: false, kind: "conflict", message: out.message }, 409);
      case "missing":
        return json({ ok: false, kind: "missing", message: out.message }, 404);
    }
  } catch (e) {
    if (e instanceof WriteNotAllowed || e instanceof ManualFileError) return json({ ok: false, message: e.message }, 400);
    console.error("admin save failed:", (e as Error).message);
    return json({ ok: false, message: `Saving failed: ${(e as Error).message}` }, 502);
  }
}
