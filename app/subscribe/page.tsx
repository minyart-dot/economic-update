import type { Metadata } from "next";
import { NoteBox } from "@/components/Callout";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@/components/SectionHeader";
import { SubscribeForm } from "@/components/SubscribeForm";

export const metadata: Metadata = { title: "Subscribe" };

export default async function Subscribe({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <PageShell showFooterForm={false}>
      <SectionHeader number="✉" title="Get the brief by email" kicker="Free · one email a month · unsubscribe anytime" />
      <p>
        When each monthly edition is published, you get one short email: the headline numbers, the month in brief, a line for
        each investment type and a link to the full page. The website stays free and open to everyone; signing up is optional.
      </p>
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-bad bg-bad-bg px-3 py-2 text-sm font-semibold text-bad-text">
          {error}
        </p>
      )}
      <SubscribeForm id="subscribe-page" />
      <NoteBox title="Privacy">
        We only use your email to send this brief. No sharing, no tracking pixels added by us. Every email has a one-click
        unsubscribe link. Emails are sent through Buttondown.
      </NoteBox>
    </PageShell>
  );
}
