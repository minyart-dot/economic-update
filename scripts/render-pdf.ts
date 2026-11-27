// Renders an edition to a US Letter PDF (spec 3.1 /edition/[yyyy-mm].pdf, 8, 12.2 step 3).
//
//   npm run pdf -- 2026-11                       build output must exist (npm run build); starts `next start`
//                                                on a free port, renders, stops it
//   npm run pdf -- 2026-11 --url https://site    render the live page (used by the publish workflow)
//   add --wait to retry until BASE/archive/YYYY-MM returns 200 (up to 15 minutes)
//   add --out path/to/file.pdf to write somewhere other than public/editions/YYYY-MM.pdf
//
// The page's print stylesheet does the layout (each section on a new page, nav and forms hidden).
// Charts render lazily on screen, so this scrolls the whole page, fires "beforeprint", and waits
// until every chart figure has drawn its SVG before printing.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium, type Page } from "playwright";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const idArg = args.find((a) => /^\d{4}-\d{2}$/.test(a));
if (!idArg) {
  console.error("Usage: npm run pdf -- YYYY-MM [--url BASE] [--wait] [--out file.pdf]");
  process.exit(2);
}
const id: string = idArg;
const out = opt("--out") ?? path.join("public", "editions", `${id}.pdf`);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor200(url: string, minutes: number, quiet = false): Promise<void> {
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.status === 200) return;
      if (!quiet) console.log(`Waiting for ${url} (status ${res.status})…`);
    } catch {
      if (!quiet) console.log(`Waiting for ${url}…`);
    }
    if (Date.now() > until) throw new Error(`${url} did not return 200 within ${minutes} minutes`);
    await new Promise((r) => setTimeout(r, quiet ? 500 : 20_000));
  }
}

async function startLocalServer(): Promise<{ base: string; proc: ChildProcess }> {
  if (!fs.existsSync(path.join(".next", "BUILD_ID"))) {
    throw new Error("No production build found. Run `npm run build` first, or pass --url BASE.");
  }
  const port = await freePort();
  const bin = path.join("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
  const proc = spawn(bin, ["start", "-p", String(port), "-H", "127.0.0.1"], { stdio: ["ignore", "pipe", "inherit"] });
  proc.stdout?.on("data", () => {});
  const base = `http://127.0.0.1:${port}`;
  await waitFor200(base, 1, true);
  return { base, proc };
}

/** Scroll top to bottom so every IntersectionObserver fires, then trigger the print hook. */
async function revealCharts(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("beforeprint"));
  });
}

async function main() {
  let server: { base: string; proc: ChildProcess } | null = null;
  const urlArg = opt("--url");
  try {
    let base: string;
    if (urlArg) {
      base = urlArg.replace(/\/$/, "");
    } else {
      server = await startLocalServer();
      base = server.base;
    }
    const pageUrl = `${base}/archive/${id}`;
    if (args.includes("--wait")) await waitFor200(pageUrl, 15);

    const browser = await chromium.launch();
    try {
      // Lay the page out at the printable width (8.5in - 2 x 0.6in = 7.3in = 701 CSS px) so the
      // charts measure themselves for the paper, not for a desktop window.
      const page = await browser.newPage({ viewport: { width: 701, height: 1000 } });
      const res = await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
      if (!res || res.status() !== 200) throw new Error(`${pageUrl} returned ${res?.status() ?? "no response"}`);

      const label = (await page.locator("header p.text-sm.font-semibold").first().textContent())?.trim() ?? id;
      const figures = await page.locator("figure[data-chart] [role=group]").count();

      await revealCharts(page);
      // Every chart figure must contain a drawn Recharts surface (legend icons are also
      // svg.recharts-surface, so check per figure rather than counting surfaces).
      await page.waitForFunction(
        () => {
          const groups = [...document.querySelectorAll("figure[data-chart] [role=group]")];
          return groups.every((g) => g.querySelector("svg.recharts-surface path, svg.recharts-surface rect"));
        },
        null,
        { timeout: 60_000 },
      );
      await page.emulateMedia({ media: "print" });
      await revealCharts(page);
      // Let ResponsiveContainer re-measure for the printed column width.
      await page.waitForTimeout(1500);

      const drawn = await page.evaluate(() =>
        [...document.querySelectorAll("figure[data-chart]")]
          .filter((f) => f.querySelector("svg.recharts-surface"))
          .map((f) => f.getAttribute("data-chart")),
      );

      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.pdf({
        path: out,
        format: "Letter",
        printBackground: true,
        margin: { top: "0.6in", right: "0.6in", bottom: "0.75in", left: "0.6in" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#6a7380;padding:0 0.6in;display:flex;justify-content:space-between"><span>State of the Market · ${label.replace(/</g, "")} · Data only; not investment advice.</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      });
      const size = fs.statSync(out).size;
      console.log(`Wrote ${out} (${(size / 1024).toFixed(0)} KB) from ${pageUrl}`);
      console.log(`Charts drawn: ${drawn.length}/${figures} (${drawn.join(", ")})`);
      if (drawn.length < figures) throw new Error("Some charts did not render");
    } finally {
      await browser.close();
    }
  } finally {
    server?.proc.kill();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
