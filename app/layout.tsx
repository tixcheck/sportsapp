import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

// Body / UI + data workhorse (DESIGN §3) — a Franklin Gothic revival, the classic
// newspaper deck/caption sans. Exposed as --font-sans (Tailwind font-sans).
const libreFranklin = Libre_Franklin({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Display face (DESIGN §3) — a newspaper serif with characterful italics; used for
// headings, team names in the report, and the signature scoreline numerals.
// Exposed as --font-display (Tailwind font-display).
const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Volleyball — leagues & tournaments",
  description:
    "A volleyball management app for organizers and players in Toronto.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${libreFranklin.variable} ${newsreader.variable}`}
    >
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
