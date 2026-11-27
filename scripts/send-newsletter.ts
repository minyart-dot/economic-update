// Sends the monthly email for an edition through Buttondown (spec 12.2, 13.3).
//
//   npm run newsletter -- 2026-11 --preview     write out/newsletter-2026-11.html/.txt only
//   npm run newsletter -- 2026-11 --dry-run     preview + create a Buttondown DRAFT (nothing is sent)
//   npm run newsletter -- 2026-11 --send        send to all subscribers, then record newsletter_sent_at
//   npm run newsletter -- --auto --send         send the newest edition with status "ready", if any
//   add --wait to hold the send until the edition's page is live on SITE_URL
//
// Idempotent: refuses to send an edition whose JSON already has newsletter_sent_at.
// Needs BUTTONDOWN_API_KEY (except --preview) and SITE_URL.

import fs from "node:fs";
import path from "node:path";
import { createEmail } from "../lib/buttondown";
import { listEditions, loadEditionSeed } from "../lib/data";
import { getEdition } from "../lib/edition";
import { buildNewsletter } from "../lib/newsletter";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const mode = flag("--send") ? "send" : flag("--dry-run") ? "dry-run" : "preview";
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

function pickEdition(): string | null {
  if (flag("--auto")) {
    const ready = listEditions().filter((id) => {
      const e = loadEditionSeed(id) as unknown as Record<string, unknown>;
      return e.status === "ready" && !e.newsletter_sent_at;
    });
    return ready.at(-1) ?? null;
  }
  const id = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  if (!id) throw new Error("Pass an edition id like 2026-11, or --auto");
  return id;
}

async function main() {
  const id = pickEdition();
  if (!id) {
    console.log("No edition with status \"ready\" waiting to be sent. Nothing to do.");
    return;
  }
  const file = path.join(process.cwd(), "data", "editions", `${id}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (mode === "send" && raw.newsletter_sent_at) {
    console.log(`Edition ${id} was already emailed on ${raw.newsletter_sent_at}. Refusing to send twice.`);
    return;
  }
  if (mode === "send" && !process.env.SITE_URL) throw new Error("SITE_URL must be set to send (links would point to localhost)");

  const nl = buildNewsletter(getEdition(id), siteUrl);
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync(`out/newsletter-${id}.html`, nl.html);
  fs.writeFileSync(`out/newsletter-${id}.txt`, nl.text);
  console.log(`Subject: ${nl.subject}\nPreheader: ${nl.preheader}\nLink: ${nl.editionUrl}\nPreview written to out/newsletter-${id}.html and .txt`);
  if (mode === "preview") return;

  // --wait: don't email a link until the deployed page answers (spec 12.2 step 2).
  if (flag("--wait")) await waitForPage(nl.editionUrl);

  const res = await createEmail({ subject: nl.subject, body: nl.html, status: mode === "send" ? "about_to_send" : "draft" });
  if (!res.ok) throw new Error(`Buttondown returned ${res.status}: ${res.text.slice(0, 500)}`);
  if (mode === "dry-run") {
    console.log("Created a DRAFT in Buttondown. Open Buttondown > Emails to preview or send a test to yourself. Nothing was sent.");
    return;
  }

  raw.newsletter_sent_at = new Date().toISOString();
  raw.status = "published";
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  console.log(`Sent. Recorded newsletter_sent_at in data/editions/${id}.json.`);
}

async function waitForPage(url: string, minutes = 15) {
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (res.status === 200) {
        console.log(`Live: ${url}`);
        return;
      }
      console.log(`Waiting for ${url} (status ${res.status})…`);
    } catch {
      console.log(`Waiting for ${url}…`);
    }
    if (Date.now() > until) throw new Error(`${url} did not return 200 within ${minutes} minutes; not sending.`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
