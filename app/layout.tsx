import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Dancing_Script,
  Great_Vibes,
  Libre_Franklin,
  Newsreader,
} from "next/font/google";
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

// Signature faces. Three, because a signature people choose the look of is
// theirs in a way a fixed one isn't — and because the same name in three hands
// makes it obvious the rendering is a choice rather than a claim about
// handwriting. Self-hosted by next/font at build time: no request leaves the
// page, which also means these work behind the strict CSP.
const dancingScript = Dancing_Script({
  variable: "--font-sig-flowing",
  subsets: ["latin"],
  display: "swap",
});

const greatVibes = Great_Vibes({
  variable: "--font-sig-formal",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-sig-casual",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MySportsApp — leagues, tournaments & ladders",
  description:
    "Scheduling, standings, registration and payments for league and tournament organizers. Free to organize.",
};

// Browser chrome (and PWA) color — warm paper, matching the app background.
export const viewport: Viewport = {
  themeColor: "#F1E9D9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${libreFranklin.variable} ${newsreader.variable} ${dancingScript.variable} ${greatVibes.variable} ${caveat.variable}`}
    >
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
