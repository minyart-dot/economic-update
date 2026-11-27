import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";

export const metadata: Metadata = { title: "Unsubscribe" };

export default function Unsubscribe() {
  return (
    <PageShell showFooterForm={false}>
      <SectionHeader number="✉" title="Unsubscribe" kicker="One click, any time" />
      <p>
        Every email has an <strong>Unsubscribe</strong> link at the bottom. Click it and you are removed right away; there is
        nothing else to do and no account to delete.
      </p>
      <p>
        Can&rsquo;t find an email? Reply to any issue with &ldquo;unsubscribe&rdquo; and you will be removed by hand. The
        website itself stays free to read either way.
      </p>
    </PageShell>
  );
}
