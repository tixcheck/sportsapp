import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowRight } from "lucide-react";

import { getRegistrationEvent } from "@/lib/queries/registration";
import { getMyFreeAgentSignup } from "@/lib/queries/free-agents";
import { IndividualSignupForm } from "@/components/registration/individual-signup-form";
import { getCompetitionPaymentSettings } from "@/lib/queries/payments";
import { getUser } from "@/lib/auth/user";
import {
  EventDescription,
  EventFacts,
  EventVenues,
  SpotsBadge,
} from "@/components/public/event-details";
import { ROSTER_SIZE, SPORTS } from "@/lib/formats";
import { formatCents } from "@/lib/payments/format";
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

  // Pricing drives whether the form asks how they'll pay and whether it sends
  // them on to Stripe. Read after the event so a missing slug 404s first.
  const feeSettings = await getCompetitionPaymentSettings(event.id);
  // Only asked for when the event actually takes individuals — no point
  // querying a pool that cannot exist.
  const mySignup = event.allowIndividualSignups
    ? await getMyFreeAgentSignup(event.id)
    : null;
  const fee =
    feeSettings.registrationFeeCents > 0
      ? {
          teamCents: feeSettings.registrationFeeCents,
          allowCaptainPays: feeSettings.allowCaptainPays,
          allowSplitPayment: feeSettings.allowSplitPayment,
          paymentRequired: feeSettings.paymentRequired,
        }
      : null;

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
        {event.bannerUrl && (
          // A linked image, not an upload (migration 0074) — a broken link
          // degrades to empty space rather than a broken layout.
          // eslint-disable-next-line @next/next/no-img-element -- external URL, no loader configured
          <img
            src={event.bannerUrl}
            alt=""
            className="h-40 w-full object-cover sm:h-56"
          />
        )}
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo, fixed height */}
            <img
              src="/mysportsapp-logo.svg"
              alt="MySportsApp"
              className="h-6 w-auto"
            />
          </Link>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              {sportLabel} {event.type} · Registration
            </p>
            <SpotsBadge event={event} />
          </div>

          <h1 className="font-display text-foreground mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {event.name}
          </h1>

          <div className="mt-3 flex items-center gap-2">
            {event.org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external URL, no loader configured
              <img
                src={event.org.logoUrl}
                alt=""
                className="size-6 rounded-full object-cover"
              />
            )}
            <p className="text-muted-foreground text-sm">
              Hosted by{" "}
              <span className="text-foreground font-medium">
                {event.org.name}
              </span>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        <EventFacts
          event={event}
          feeCents={fee ? fee.teamCents : null}
          splitAllowed={fee?.allowSplitPayment ?? false}
        />

        {event.description && <EventDescription text={event.description} />}

        <EventVenues event={event} />

        {event.registrationOpen ? (
          <Card id="register" className="scroll-mt-4">
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
                fee={fee}
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

        {event.allowIndividualSignups && event.signupWindowOpen && (
          <Card id="individual" className="scroll-mt-4">
            <CardHeader>
              <CardTitle>No team? Sign up on your own</CardTitle>
              <CardDescription>
                Put your name down and the organizer will place you on a team.
                {feeSettings.individualFeeCents > 0 && (
                  <>
                    {" "}
                    Individual sign-up is{" "}
                    <span className="text-foreground font-medium">
                      {formatCents(feeSettings.individualFeeCents)}
                    </span>
                    .
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IndividualSignupForm
                competitionId={event.id}
                sport={event.sport}
                isAuthed={!!user}
                userEmail={user?.email}
                loginHref={`/login?next=/register/${slug}`}
                feeCents={feeSettings.individualFeeCents}
                existing={mySignup}
              />
            </CardContent>
          </Card>
        )}

        <div className="border-border space-y-3 border-t pt-6 text-center">
          {event.registrationOpen && (
            <Button asChild size="lg">
              <a href="#register">
                Register your team
                <ArrowRight className="size-4" />
              </a>
            </Button>
          )}
          <p className="text-muted-foreground text-sm">
            <Link
              href={event.publicPath}
              className="hover:text-foreground underline"
            >
              View the full {event.type} page
            </Link>
            {event.org.contactEmail && (
              <>
                {" · "}
                <a
                  href={`mailto:${event.org.contactEmail}`}
                  className="hover:text-foreground underline"
                >
                  Questions? Email {event.org.name}
                </a>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
