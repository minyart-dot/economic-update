import type { Metadata } from "next";
import type { ReactNode } from "react";

// The owner's admin form: never indexed (also disallowed in app/robots.ts, left out of app/sitemap.ts).
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-panel">{children}</div>;
}
