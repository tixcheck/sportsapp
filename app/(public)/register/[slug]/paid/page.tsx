import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, CheckCircle2 } from "lucide-react";

import { getRegistrationEvent } from "@/lib/queries/registration";
import { getMyOfflinePaymentReturn } from "@/lib/queries/payments";
import { getUser } from "@/lib/auth/user";
import { formatCents } from "@/lib/payments/format";
import { PayerReferenceForm } from "@/components/payments/payer-reference-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Thanks — payment sent",
  robots: { index: false, follow: false },
};

/**
 * Where PayPal sends someone after they pay.
 *
 * THIS PAGE MUST NEVER MARK ANYTHING PAID, and the reason is worth stating
 * where the next person will read it. A PayPal payment link is created once in
 * the organizer's own dashboard and shared by every team in the competition,
 * so:
 *
 *   - its return URL is identical for everyone and carries no reference;
 *   - reaching it is an ordinary unauthenticated GET;
 *   - anyone can bookmark it, share it, or type it from memory.
 *
 * If landing here confirmed a team, the first captain to paste the URL into a
 * group chat would register the whole league for free. So this page reads
 * state and reports it. Confirmation happens in one place only: the organizer
 * checking their PayPal account and saying what arrived.
 *
 * There is also no failure counterpart to this page. PayPal keeps a declined
 * payer on its own page to retry, so non-payment reaches us as silence, never
 * as a redirect. The organizer's pending list is what catches it.
 */
export default async function PaidReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const [{ slug }, { kind }, user] = await Promise.all([
    params,
    searchParams,
    getUser(),
  ]);
  const event = await getRegistrationEvent(slug);
  if (!event) notFound();

  const registerHref = `/register/${slug}`;
  // Named rather than "the organizer" wherever we have it: this page is about
  // someone else holding your money, and a name is reassuring where a role is
  // not.
  const organizer = event.org.name || "the organizer";
  const Organizer = event.org.name || "The organizer";

  // Paid on a phone, registered on a laptop — a real case, because the PayPal
  // link often gets opened from the email rather than the tab that registered.
  // Sending them to sign in has to preserve where they were going.
  if (!user) {
    return (
      <Shell heading="Thanks — one thing first">
        <p>
          We can&rsquo;t tell whose payment this is until you sign in. Your
          money is safe with {organizer}; this is only about showing you the
          right team.
        </p>
        <Actions>
          <Button asChild>
            <Link
              href={`/login?next=${encodeURIComponent(`/register/${slug}/paid${kind ? `?kind=${kind}` : ""}`)}`}
            >
              Sign in
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={registerHref}>Back to {event.name}</Link>
          </Button>
        </Actions>
      </Shell>
    );
  }

  const state = await getMyOfflinePaymentReturn(event.id);
  // A free agent has no team page; their sign-up lives on the event itself.
  const mineHref = state?.teamId ? `/teams/${state.teamId}` : registerHref;
  const mineLabel = state?.teamId ? "View your team" : "View your sign-up";

  // Paid without registering first: nothing stops someone finding the link on
  // the organizer's own site. Not an error — walk them into registration,
  // because their money has genuinely gone and the fix is the rest of the form.
  if (!state) {
    return (
      <Shell heading="Thanks — now let's finish your entry">
        <p>
          We don&rsquo;t have a registration against your account for{" "}
          <strong>{event.name}</strong> yet. If you&rsquo;ve just paid, nothing
          is lost — finish setting your team up and {organizer} will match your
          payment to it.
        </p>
        <Actions>
          <Button asChild>
            <Link href={registerHref}>Set up your team</Link>
          </Button>
        </Actions>
      </Shell>
    );
  }

  if (state.confirmed) {
    return (
      <Shell heading={`${state.teamName} is confirmed`} tone="done">
        <p>
          {Organizer} has your payment of {formatCents(state.expectedCents)} and
          your spot is locked in.
          {state.teamId && state.teamStatus !== "active" && (
            <>
              {" "}
              Your team still has a step left before it appears in the schedule
              — check your team page.
            </>
          )}
        </p>
        <Actions>
          <Button asChild>
            <Link href={mineHref}>{mineLabel}</Link>
          </Button>
        </Actions>
      </Shell>
    );
  }

  return (
    <Shell heading={`Thanks — we've passed this to ${organizer}`}>
      <p>
        Your registration for <strong>{event.name}</strong> is in, and{" "}
        <strong>{state.teamName}</strong> is holding a spot.
      </p>

      {/*
        The honest sentence, and the whole reason this page is worded the way
        it is. We were not told anything by PayPal and we are not going to
        pretend otherwise.
      */}
      <p>
        {state.method === "paypal"
          ? `${Organizer} collects through their own PayPal account, so we aren't told when a payment goes through. They'll check it against their account and confirm it — usually within a day.`
          : `${Organizer} will confirm the transfer once it lands, usually within a day.`}
      </p>

      <div className="border-rule bg-surface mt-4 rounded-lg border p-4">
        <p className="text-ink flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4" />
          Waiting on {organizer}
        </p>
        <p className="text-ink-2 mt-1 text-sm">
          Amount owed: {formatCents(state.expectedCents)}
        </p>

        {state.method === "paypal" && (
          <PayerReferenceForm
            paymentId={state.paymentId}
            initial={state.payerReference}
          />
        )}
      </div>

      {/*
        Paying is not the only gate. A team can be paid and still not be an
        entrant, because the roster minimum and waiver signatures are separate
        requirements — and someone who has just handed over money is exactly
        the person who will otherwise assume they are done.
      */}
      {state.teamId && state.teamStatus === "pending_waiver" && (
        <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          <strong className="font-semibold">One more thing.</strong> Paying
          doesn&rsquo;t complete your entry on its own — your team still needs
          its full roster, with every player having signed the waiver. Your team
          page shows who&rsquo;s outstanding.
        </p>
      )}

      <Actions>
        <Button asChild>
          <Link href={mineHref}>{mineLabel}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={registerHref}>Back to {event.name}</Link>
        </Button>
      </Actions>
    </Shell>
  );
}

function Shell({
  heading,
  tone = "waiting",
  children,
}: {
  heading: string;
  tone?: "waiting" | "done";
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <div
        className={
          tone === "done"
            ? "text-pine flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase"
            : "text-claret flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase"
        }
      >
        {tone === "done" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Clock className="size-4" />
        )}
        {tone === "done" ? "Confirmed" : "Payment sent"}
      </div>
      <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {heading}
      </h1>
      <div className="text-ink-2 mt-4 space-y-3 leading-relaxed">
        {children}
      </div>
    </main>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap gap-2">{children}</div>;
}
