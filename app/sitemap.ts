import type { MetadataRoute } from "next";
import { loadEditionSeed, publicEditions } from "@/lib/data";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const editions = publicEditions();
  return [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/archive`, changeFrequency: "monthly" },
    { url: `${site}/methodology`, changeFrequency: "yearly" },
    { url: `${site}/subscribe`, changeFrequency: "yearly" },
    ...editions.map((id) => ({ url: `${site}/archive/${id}`, lastModified: loadEditionSeed(id).published_at })),
  ];
}
