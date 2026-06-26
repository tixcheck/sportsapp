import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";

import { getPublicLeague } from "@/lib/queries/leagues";
import { getStandings } from "@/lib/standings/compute";
import { getBrackets } from "@/lib/queries/bracket";
import { getMyTeamIds } from "@/lib/queries/access";
import { SPORTS } from "@/lib/formats";
import { LeagueTabs } from "@/components/public/league-tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await getPublicLeague(slug);
  return {
    title: league ? `${league.name} — schedule & teams` : "League",
  };
}

export default async function PublicLeaguePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getPublicLeague(slug);
  if (!league) notFound();
  const [standings, myTeamIds, brackets] = await Promise.all([
    getStandings(league.id),
    getMyTeamIds(league.id),
    getBrackets(league.id),
  ]);

  const sportLabel = SPORTS.find((s) => s.value === league.sport)?.label;

  return (
    <div className="bg-background min-h-svh">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo, fixed height */}
            <img src="/logo.png" alt="MySportsApp" className="h-6 w-auto" />
          </Link>
          <p className="text-primary mt-5 text-xs font-semibold tracking-wide uppercase">
            {sportLabel} league
          </p>
          <h1 className="font-display text-foreground mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {league.name}
          </h1>
          <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {league.startDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {league.startDate} → {league.endDate}
              </span>
            )}
            {league.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {league.venue}
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <LeagueTabs
          league={league}
          standings={standings}
          brackets={brackets}
          myTeamIds={myTeamIds}
        />
      </main>
    </div>
  );
}
