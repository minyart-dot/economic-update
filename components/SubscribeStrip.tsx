import { SubscribeForm } from "./SubscribeForm";

/** Signup band placed right after the one-page summary, so readers meet it early. */
export function SubscribeStrip() {
  return (
    <aside aria-labelledby="subscribe-top-title" className="no-print grid grid-cols-1 gap-4 rounded-md bg-navy px-4 py-4 text-white sm:px-5 md:grid-cols-[1fr_minmax(0,28rem)] md:items-center [&>*]:min-w-0">
      <div>
        <p id="subscribe-top-title" className="text-[16px] font-bold">
          Get this brief by email, free
        </p>
        <p className="mt-0.5 text-[13px] text-white/85">
          One email a month when the new edition is out: the headline numbers, the month in brief and a link to the full
          page. Everything stays free to read here, with or without signing up.
        </p>
      </div>
      <SubscribeForm id="subscribe-top" dark compact />
    </aside>
  );
}
