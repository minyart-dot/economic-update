import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/Callout";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";

export const metadata: Metadata = { title: "Subscription confirmed", robots: { index: false } };

export default function Confirmed() {
  return (
    <PageShell showFooterForm={false}>
      <SectionHeader number="✓" title="You're subscribed" kicker="Thanks for confirming" />
      <Callout title="What happens next">
        <p>
          You will get one email when each new edition is published. In the meantime, the{" "}
          <Link href="/" className="source-link">
            latest edition
          </Link>{" "}
          is always on the website.
        </p>
      </Callout>
    </PageShell>
  );
}
