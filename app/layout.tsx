import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WHO?",
  description: "Real-time social deduction on the XRPL.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
