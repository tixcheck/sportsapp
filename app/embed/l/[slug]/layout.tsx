import type { Metadata } from "next";

/**
 * Embeds carry no chrome of ours: no navbar, no hero, no footer — just the
 * table, so it sits inside the host's page without fighting it.
 *
 * The host's colours are applied in the PAGES rather than here, because a
 * layout doesn't receive `searchParams` in the App Router — only pages do.
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
  return <>{children}</>;
}
