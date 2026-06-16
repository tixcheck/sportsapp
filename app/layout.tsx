import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

// Body / UI workhorse (DESIGN §3). Exposed as --font-sans (Tailwind font-sans).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Display face for headings + signature score numerals (DESIGN §3).
// Exposed as --font-display (Tailwind font-display).
const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
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
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
