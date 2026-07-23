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

export const metadata: Metadata = {
  title: "WHO?",
  description: "find the imposter. win real XRP.",
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
