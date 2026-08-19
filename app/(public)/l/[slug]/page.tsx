import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";

import { DateTime } from "luxon";

import { getPublicLeague } from "@/lib/queries/leagues";
import { getPlayerStats } from "@/lib/queries/player-stats";
import { getLadderNightStandings } from "@/lib/queries/ladder-standings";
import { getStandings } from "@/lib/standings/compute";
import { getBrackets } from "@/lib/queries/bracket";
import { getMyTeamIds, getScorableMatchIds } from "@/lib/queries/access";
import { getUser } from "@/lib/auth/user";
import { ROSTER_SIZE, SPORTS } from "@/lib/formats";
import { registerLeagueTeamAction } from "@/server/actions/leagues";
import { RegistrationForm } from "@/components/tournament/registration-form";
import { LeagueTabs } from "@/components/public/league-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const [league, user] = await Promise.all([getPublicLeague(slug), getUser()]);
  if (!league) notFound();
  const [
    standings,
    myTeamIds,
    scorableMatchIds,
    brackets,
    playerStats,
    ladderNights,
  ] = await Promise.all([
    getStandings(league.id),
    getMyTeamIds(league.id),
    getScorableMatchIds(league.id),
    getBrackets(league.id),
    getPlayerStats(league.id),
    getLadderNightStandings(league.id),
  ]);

  const sportLabel = SPORTS.find((s) => s.value === league.sport)?.label;
  const deadlineText = league.registrationDeadline
    ? DateTime.fromISO(league.registrationDeadline, {
        zone: league.timezone,
      }).toFormat("LLL d, h:mm a")
    : null;

  return (
    <div className="bg-background min-h-svh">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo, fixed height */}
            <img
              src="/mysportsapp-logo.svg"
              alt="MySportsApp"
              className="h-6 w-auto"
            />
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

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {league.registrationOpen && (
          <Card>
            <CardHeader>
              <CardTitle>Register your team</CardTitle>
              <CardDescription>
                {deadlineText
                  ? `Registration closes ${deadlineText}.`
                  : "Registration is open."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegistrationForm
                competitionId={league.id}
                divisions={league.tiers}
                rosterSize={ROSTER_SIZE[league.sport]}
                isAuthed={!!user}
                userEmail={user?.email}
                loginHref={`/login?next=/l/${slug}`}
                action={registerLeagueTeamAction}
                divisionLabel="Tier"
              />
            </CardContent>
          </Card>
        )}

        <LeagueTabs
          playerStats={playerStats}
          ladderNights={ladderNights}
          league={league}
          standings={standings}
          brackets={brackets}
          myTeamIds={myTeamIds}
          scorableMatchIds={scorableMatchIds}
          initialTab={tab}
        />
      </main>
    </div>
  );
}
