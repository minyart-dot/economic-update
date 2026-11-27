import { loadEditionSeed, publicEditions } from "@/lib/data";
import { OG_SIZE, editionOgImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "State of the Market monthly edition";
export const dynamicParams = false;

export function generateStaticParams() {
  return publicEditions().map((edition) => ({ edition }));
}

export default async function Image({ params }: { params: Promise<{ edition: string }> }) {
  const { edition } = await params;
  loadEditionSeed(edition);
  return editionOgImage(edition);
}
