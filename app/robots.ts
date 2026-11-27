import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/subscribe/thanks", "/subscribe/confirmed"] },
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
