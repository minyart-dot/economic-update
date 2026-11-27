import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF edition is a static file at /editions/YYYY-MM.pdf (scripts/render-pdf.ts);
  // also serve it at the spec's /edition/YYYY-MM.pdf address (spec 3.1).
  async rewrites() {
    return [{ source: "/edition/:id(\\d{4}-\\d{2}).pdf", destination: "/editions/:id.pdf" }];
  },
};

export default nextConfig;
