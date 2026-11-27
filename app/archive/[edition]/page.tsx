import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditionPage } from "@/components/EditionPage";
import { latestEditionId, loadEditionSeed, publicEditions } from "@/lib/data";
import { getEdition } from "@/lib/edition";

export const dynamicParams = false;

export function generateStaticParams() {
  return publicEditions().map((edition) => ({ edition }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }): Promise<Metadata> {
  const { edition } = await params;
  const seed = loadEditionSeed(edition);
  return { title: `${seed.edition_label}: ${seed.headline_summary}`, description: seed.month_in_brief };
}

export default async function ArchivedEdition({ params }: { params: Promise<{ edition: string }> }) {
  const { edition } = await params;
  if (!publicEditions().includes(edition)) notFound();
  const ed = getEdition(edition);
  return <EditionPage ed={ed} isLatest={edition === latestEditionId()} />;
}
