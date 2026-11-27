import { EditionPage } from "@/components/EditionPage";
import { latestEditionId } from "@/lib/data";
import { getEdition } from "@/lib/edition";

export const dynamic = "force-static";

export default function Home() {
  const ed = getEdition(latestEditionId());
  return <EditionPage ed={ed} />;
}
