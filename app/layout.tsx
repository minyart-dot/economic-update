import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// SITE_URL is the public address; Render also provides RENDER_EXTERNAL_URL (its onrender.com address).
const siteUrl = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    siteName: "State of the Market",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  title: {
    default: "State of the Market · Monthly Brief for Real Estate Investors",
    template: "%s · State of the Market",
  },
  description:
    "A free monthly economic and real estate briefing for investors: U.S. and Texas housing, permits, rents, commercial real estate, credit, rates and jobs. Data only; not investment advice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14213d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-navy"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
