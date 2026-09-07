import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowRight } from "lucide-react";

import { getRegistrationEvent } from "@/lib/queries/registration";
import { getMyFreeAgentSignup } from "@/lib/queries/free-agents";
import { getFullness, getMyWaitlistEntry } from "@/lib/queries/waitlist";
import { WaitlistForm } from "@/components/registration/waitlist-form";
import { IndividualSignupForm } from "@/components/registration/individual-signup-form";
import { EntryChoice } from "@/components/registration/entry-choice";
import {
  getCompetitionPaymentSettings,
  getPaymentAccount,
} from "@/lib/queries/payments";
import { paymentAccountStatus } from "@/lib/payments/account-status";
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

  // Capacity is asked of the database, not derived from team counts, because
  // an unexpired waitlist OFFER occupies a spot too.
  const [fullness, myWaitlistEntry] = await Promise.all([
    getFullness(
      event.id,
      event.divisions.map((d) => d.id),
    ),
    getMyWaitlistEntry(event.id),
  ]);
  const anythingFull =
    fullness.competitionFull || fullness.fullDivisionIds.size > 0;
  // Whether a card is even an option here. An organizer who hasn't connected
  // Stripe — because they collect through PayPal, or don't want to — must not
  // be offered as a payer choice at all: picking it would send someone to a
  // checkout that cannot exist, and they'd conclude the event was broken
  // rather than that this organizer takes PayPal.
  const cardAvailable = paymentAccountStatus(
    await getPaymentAccount(event.org.id),
  ).canAcceptPayments;

  const fee =
    feeSettings.registrationFeeCents > 0
      ? {
          teamCents: feeSettings.registrationFeeCents,
          allowCaptainPays: feeSettings.allowCaptainPays && cardAvailable,
          allowSplitPayment: feeSettings.allowSplitPayment && cardAvailable,
          paymentRequired: feeSettings.paymentRequired,
          etransferEmail: feeSettings.etransferEmail,
          paypalUrl: feeSettings.paypalTeamUrl,
          taxCents: feeSettings.taxEnabled
            ? Math.round(
                (feeSettings.registrationFeeCents * feeSettings.taxPercent) /
                  100,
              )
            : 0,
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

  // Both entry paths, built once. They appear either side by side behind a
  // chooser (when this event takes individuals) or on their own, and defining
  // them here keeps those two arrangements from drifting apart.
  const showIndividual = event.allowIndividualSignups && event.signupWindowOpen;

  const teamBlurb = (
    <>
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
    </>
  );

  const individualBlurb = (
    <>
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
    </>
  );

  const teamForm = (
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
  );

  const individualForm = (
    <IndividualSignupForm
      cardAvailable={cardAvailable}
      paypalUrl={feeSettings.paypalIndividualUrl ?? feeSettings.paypalTeamUrl}
      competitionId={event.id}
      sport={event.sport}
      isAuthed={!!user}
      userEmail={user?.email}
      loginHref={`/login?next=/register/${slug}`}
      feeCents={feeSettings.individualFeeCents}
      existing={mySignup}
    />
  );

  return (
    <div className="bg-background min-h-svh">
      <header className="border-border bg-surface border-b">
        {event.bannerUrl && (
          // `contain`, not `cover`. The strip is nearly 9:1 on a desktop, and
          // organizers upload their LOGO here as often as a banner — cropping
          // to fill takes a 2:1 crest and shows you the middle of the ball,
          // enlarged and soft. Containing it means a logo appears whole at its
          // own proportions and a wide banner still spans the strip; the
          // sunken background makes the letterboxing look deliberate rather
          // than like a failed image.
          <div className="bg-paper-sunken flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- external URL, no loader configured */}
            <img
              src={event.bannerUrl}
              alt=""
              className="h-40 w-auto max-w-full object-contain sm:h-56"
            />
          </div>
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
          showIndividual ? (
            <div id="register" className="scroll-mt-4">
              <EntryChoice
                teamTitle="Register your team"
                teamDescription={teamBlurb}
                individualTitle="Sign up on your own"
                individualDescription={individualBlurb}
                teamForm={teamForm}
                individualForm={individualForm}
              />
            </div>
          ) : (
            <Card id="register" className="scroll-mt-4">
              <CardHeader>
                <CardTitle>Register your team</CardTitle>
                <CardDescription>{teamBlurb}</CardDescription>
              </CardHeader>
              <CardContent>{teamForm}</CardContent>
            </Card>
          )
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

        {event.signupWindowOpen && anythingFull && (
          <Card id="waitlist" className="scroll-mt-4">
            <CardHeader>
              <CardTitle>
                {fullness.competitionFull
                  ? "Join the waitlist"
                  : "Some tiers are full — join the waitlist"}
              </CardTitle>
              <CardDescription>
                We&apos;ll email you if a place comes free, and it&apos;s yours
                to claim before it passes on. Nothing is charged to wait.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaitlistForm
                competitionId={event.id}
                divisions={event.divisions}
                fullDivisionIds={[...fullness.fullDivisionIds]}
                competitionFull={fullness.competitionFull}
                isAuthed={!!user}
                userEmail={user?.email}
                loginHref={`/login?next=/register/${slug}`}
                existing={myWaitlistEntry}
                claimHours={event.waitlistClaimHours}
              />
            </CardContent>
          </Card>
        )}

        {/* Registration closed but individuals still welcome — the chooser
            above only renders while team sign-up is open. */}
        {showIndividual && !event.registrationOpen && (
          <Card id="individual" className="scroll-mt-4">
            <CardHeader>
              <CardTitle>Sign up on your own</CardTitle>
              <CardDescription>{individualBlurb}</CardDescription>
            </CardHeader>
            <CardContent>{individualForm}</CardContent>
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
