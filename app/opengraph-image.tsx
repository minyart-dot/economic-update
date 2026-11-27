import { latestEditionId } from "@/lib/data";
import { OG_SIZE, editionOgImage } from "@/lib/og";

export const alt = "State of the Market: the latest monthly brief for real estate investors";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return editionOgImage(latestEditionId());
}
