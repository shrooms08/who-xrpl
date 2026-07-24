import type { Metadata } from "next";
import { Permanent_Marker, Patrick_Hand, Special_Elite } from "next/font/google";
import "./globals.css";

// INK SYSTEM typefaces (all via next/font). One weight each.
const display = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const body = Patrick_Hand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const utility = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-utility",
  display: "swap",
});

// Base for absolute OG/icon URLs. Prefer an explicit app URL, then the Vercel
// production/preview domain (so link previews work before the custom domain is
// live), then localhost.
const metaBase =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(metaBase),
  title: {
    default: "WHO? — find the imposter",
    template: "%s · WHO?",
  },
  description:
    "Real-time social deduction on the XRPL — find the imposter, win real XRP.",
  applicationName: "WHO?",
  openGraph: {
    type: "website",
    siteName: "WHO?",
    title: "WHO? — find the imposter",
    description: "find the imposter. win real XRP.",
    url: "https://playwho.xyz",
  },
  twitter: {
    card: "summary_large_image",
    title: "WHO? — find the imposter",
    description: "find the imposter. win real XRP.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${utility.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
