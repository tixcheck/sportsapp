import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

import { getRegistrationEvent } from "@/lib/queries/registration";
import { getUser } from "@/lib/auth/user";
import { ROSTER_SIZE, SPORTS } from "@/lib/formats";
import { registerLeagueTeamAction } from "@/server/actions/leagues";
import { registerTeamAction } from "@/server/actions/tournaments";
import { RegistrationForm } from "@/components/tournament/registration-form";
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
  const event = await getRegistrationEvent(slug);
  return {
    title: event ? `Register — ${event.name}` : "Register",
    description: event ? `Sign your team up for ${event.name}.` : undefined,
  };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [event, user] = await Promise.all([
    getRegistrationEvent(slug),
    getUser(),
  ]);
  if (!event) notFound();

  const sportLabel = SPORTS.find((s) => s.value === event.sport)?.label;
  const deadlineText = event.registrationDeadline
    ? DateTime.fromISO(event.registrationDeadline, {
        zone: event.timezone,
      }).toFormat("LLL d, h:mm a")
    : null;
  // Full is a distinct closed reason: the deadline may be days away.
  const isFull = event.spotsLeft === 0;
  const action =
    event.type === "league" ? registerLeagueTeamAction : registerTeamAction;

  return (
    <div className="bg-background min-h-svh">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto max-w-xl px-4 py-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo, fixed height */}
            <img
              src="/mysportsapp-logo.svg"
              alt="MySportsApp"
              className="h-6 w-auto"
            />
          </Link>
          <p className="text-primary mt-5 text-xs font-semibold tracking-wide uppercase">
            {sportLabel} {event.type} · Registration
          </p>
          <h1 className="font-display text-foreground mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {event.name}
          </h1>
          <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {event.startDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {event.startDate}
                {event.endDate && event.endDate !== event.startDate
                  ? ` → ${event.endDate}`
                  : ""}
              </span>
            )}
            {event.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {event.venue}
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        {event.registrationOpen ? (
          <Card>
            <CardHeader>
              <CardTitle>Register your team</CardTitle>
              <CardDescription>
                {deadlineText
                  ? `Registration closes ${deadlineText}.`
                  : "Registration is open."}
                {event.spotsLeft !== null && (
                  <>
                    {" "}
                    <span className="text-foreground font-medium">
                      {event.spotsLeft === 1
                        ? "1 spot left"
                        : `${event.spotsLeft} spots left`}
                    </span>{" "}
                    of {event.maxTeams}.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegistrationForm
                competitionId={event.id}
                divisions={event.divisions}
                rosterSize={ROSTER_SIZE[event.sport]}
                isAuthed={!!user}
                userEmail={user?.email}
                loginHref={`/login?next=/register/${slug}`}
                action={action}
                divisionLabel={event.divisionLabel}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                {isFull ? "This event is full" : "Registration is closed"}
              </CardTitle>
              <CardDescription>
                {isFull
                  ? `All ${event.maxTeams} spots have been taken. Contact the organizer if you'd like to be added to a waitlist.`
                  : deadlineText
                    ? `Sign-ups closed ${deadlineText}.`
                    : "This event isn't accepting new teams right now."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={event.publicPath}>
                  View schedule & standings
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-muted-foreground text-center text-sm">
          <Link
            href={event.publicPath}
            className="hover:text-foreground underline"
          >
            View the full {event.type} page
          </Link>
        </p>
      </main>
    </div>
  );
}
