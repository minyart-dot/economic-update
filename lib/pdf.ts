// The PDF edition (spec 3.1 /edition/[yyyy-mm].pdf, 12.2 step 3). scripts/render-pdf.ts writes
// public/editions/YYYY-MM.pdf; the publish workflow commits it after an edition is marked ready.
// Links appear only when the file exists at build time.

import fs from "node:fs";
import path from "node:path";

export const pdfFile = (id: string) => path.join(process.cwd(), "public", "editions", `${id}.pdf`);

/** Site-relative URL of the edition's PDF, or null if it hasn't been rendered yet. */
export function pdfHref(id: string): string | null {
  return fs.existsSync(pdfFile(id)) ? `/editions/${id}.pdf` : null;
}
