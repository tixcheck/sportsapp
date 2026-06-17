import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarDays, MapPin } from "lucide-react";

import { getPoolsView, getPublicTournament } from "@/lib/queries/tournaments";
import { getStandings } from "@/lib/standings/compute";
import { getBracket } from "@/lib/queries/bracket";
import { getUser } from "@/lib/auth/user";
import { ROSTER_SIZE, SPORTS } from "@/lib/formats";
import { RegistrationForm } from "@/components/tournament/registration-form";
import { TournamentTabs } from "@/components/public/tournament-tabs";
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
  const t = await getPublicTournament(slug);
  return { title: t ? `${t.name} — pools, schedule & teams` : "Tournament" };
}

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tournament, user] = await Promise.all([
    getPublicTournament(slug),
    getUser(),
  ]);
  if (!tournament) notFound();
  const [poolsView, standings, bracket] = await Promise.all([
    getPoolsView(tournament.id),
    getStandings(tournament.id),
    getBracket(tournament.id),
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
          <Link
            href="/"
            className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium"
          >
            <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-md text-xs">
              V
            </span>
            Volleyball
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
              <RegistrationForm
                competitionId={tournament.id}
                divisions={tournament.divisions}
                rosterSize={ROSTER_SIZE[tournament.sport]}
                isAuthed={!!user}
                userEmail={user?.email}
                loginHref={`/login?next=/t/${slug}`}
              />
            </CardContent>
          </Card>
        )}

        <TournamentTabs
          tournament={tournament}
          poolsView={poolsView}
          standings={standings}
          bracket={bracket}
        />
      </main>
    </div>
  );
}
