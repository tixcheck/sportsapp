import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

import { DateTime } from "luxon";

import { getPublicLeague } from "@/lib/queries/leagues";
import { getPlayerStats } from "@/lib/queries/player-stats";
import { getLadderNightStandings } from "@/lib/queries/ladder-standings";
import { getWeightedStandings } from "@/lib/queries/weighted-standings";
import { defaultScheduleDay } from "@/lib/schedule/default-day";
import { getStandings } from "@/lib/standings/compute";
import { getBrackets } from "@/lib/queries/bracket";
import { getMyTeamIds, getScorableMatchIds } from "@/lib/queries/access";
import { SPORTS } from "@/lib/formats";
import { LeagueTabs } from "@/components/public/league-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const league = await getPublicLeague(slug);
  if (!league) notFound();
  const [
    standings,
    myTeamIds,
    scorableMatchIds,
    brackets,
    playerStats,
    ladderNights,
    weighted,
  ] = await Promise.all([
    getStandings(league.id),
    getMyTeamIds(league.id),
    getScorableMatchIds(league.id),
    getBrackets(league.id),
    getPlayerStats(league.id),
    getLadderNightStandings(league.id),
    getWeightedStandings(league.id),
  ]);

  // Open the schedule on the night people are actually asking about. "Today"
  // is read in the LEAGUE's timezone, and resolved here rather than in the
  // client component so the server and client agree on the first render.
  const today = DateTime.now().setZone(league.timezone).toFormat("yyyy-MM-dd");
  const playingDays = league.schedule
    .map((m) =>
      m.scheduledAt
        ? DateTime.fromISO(m.scheduledAt, { zone: league.timezone }).toFormat(
            "yyyy-MM-dd",
          )
        : null,
    )
    .filter((d): d is string => d != null);
  const initialDay = defaultScheduleDay(playingDays, today);

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
        {/*
          Registration lives on /register/<slug>, and ONLY there.
          This page used to render the raw form inline, which quietly bypassed
          everything the registration page does: no waiver, no registration
          questions, no address, no fee or payment-mode step, and no individual
          sign-up option. A captain who arrived here instead of there could
          enter a team having agreed to nothing and answered nothing - a back
          door, not a shortcut. So this is a signpost now.
        */}
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
              <Button asChild>
                <Link href={`/register/${slug}`}>
                  Go to registration
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <LeagueTabs
          playerStats={playerStats}
          ladderNights={ladderNights}
          weighted={weighted}
          initialDay={initialDay}
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
