import type { Metadata } from "next";

/**
 * Embeds are for someone else's page, so they carry no chrome of ours: no
 * navbar, no hero, no footer — just the table, on a transparent-ish ground that
 * sits inside the host's layout without fighting it.
 *
 * `noindex` matters more than it looks. Without it the embed competes with the
 * real league page in search results, and a player clicking through lands on a
 * bare fragment with no way to reach the rest of the league.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="bg-background text-foreground p-3">{children}</div>;
}
