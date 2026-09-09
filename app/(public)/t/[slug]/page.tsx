import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";

import { getPoolsView, getPublicTournament } from "@/lib/queries/tournaments";
import { getStandings } from "@/lib/standings/compute";
import { getBrackets } from "@/lib/queries/bracket";
import { getMyTeamIds, getScorableMatchIds } from "@/lib/queries/access";
import { SPORTS } from "@/lib/formats";
import { TournamentTabs } from "@/components/public/tournament-tabs";
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
  const t = await getPublicTournament(slug);
  return { title: t ? `${t.name} — pools, schedule & teams` : "Tournament" };
}

export default async function PublicTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const tournament = await getPublicTournament(slug);
  if (!tournament) notFound();
  const [poolsView, standings, brackets, myTeamIds, scorableMatchIds] =
    await Promise.all([
      getPoolsView(tournament.id),
      getStandings(tournament.id),
      getBrackets(tournament.id),
      getMyTeamIds(tournament.id),
      getScorableMatchIds(tournament.id),
    ]);

  const sportLabel = SPORTS.find((s) => s.value === tournament.sport)?.label;
  const deadlineText = tournament.registrationDeadline
    ? DateTime.fromISO(tournament.registrationDeadline, {
        zone: tournament.timezone,
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
            {sportLabel} tournament
          </p>
          <h1 className="font-display text-foreground mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {tournament.name}
          </h1>
          <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {tournament.startDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {tournament.startDate}
                {tournament.endDate &&
                tournament.endDate !== tournament.startDate
                  ? ` → ${tournament.endDate}`
                  : ""}
              </span>
            )}
            {tournament.startTime && tournament.endTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {DateTime.fromFormat(tournament.startTime, "HH:mm").toFormat(
                  "h:mm a",
                )}{" "}
                –{" "}
                {DateTime.fromFormat(tournament.endTime, "HH:mm").toFormat(
                  "h:mm a",
                )}
              </span>
            )}
            {tournament.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {tournament.venue}
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {/*
          Registration lives on /register/<slug>, and ONLY there - this page
          used to render the raw form inline, skipping the waiver, the
          registration questions, the address and the fee step. See the same
          note on the league page.
        */}
        {tournament.registrationOpen && (
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

        <TournamentTabs
          tournament={tournament}
          poolsView={poolsView}
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
