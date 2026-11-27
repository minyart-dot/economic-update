import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";

export const metadata: Metadata = { title: "Check your inbox", robots: { index: false } };

export default function Thanks() {
  return (
    <PageShell showFooterForm={false}>
      <SectionHeader number="✓" title="Check your inbox to confirm" kicker="One more step" />
      <Callout title="Confirm your email">
        <p>
          We just sent you an email with a confirmation link. Click it to start receiving the monthly brief. If it is not there
          in a few minutes, check your spam or promotions folder.
        </p>
      </Callout>
    </PageShell>
  );
}
