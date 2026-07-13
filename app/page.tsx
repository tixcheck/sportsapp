import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CircleDot,
  Link2,
  Trophy,
  Users,
} from "lucide-react";

import { getUser } from "@/lib/auth/user";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  // Logged-in visitors skip the marketing front door.
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col overflow-x-clip">
      <header className="border-rule bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- marketing logo, fixed height */}
          <img
            src="/logo.png"
            alt="MySportsApp"
            className="h-7 w-auto max-w-[9.5rem] shrink object-contain sm:h-8 sm:max-w-[12rem]"
          />
          <nav className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Sign up</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-3xl px-5 pt-20 pb-16 text-center">
          <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
            Volleyball, organized · Built in Toronto
          </p>
          <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Run your league or tournament like it runs itself.
          </h1>
          <p className="text-ink-2 mx-auto mt-5 max-w-xl text-lg">
            Auto-scheduling, real standings, live scores, and public pages your
            players actually love — without the spreadsheet, the group chat, and
            the day-of chaos. Free for organizers to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">Get started — it&apos;s free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>
          <p className="text-ink-3 mt-5 text-sm">
            Indoor 6s · Beach 2s · Co-ed 4s — no platform fee on your money.
          </p>
        </section>

        {/* Who it's for */}
        <section className="border-rule bg-paper-raised border-y">
          <div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-14 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-xl font-semibold">
                For organizers
              </h2>
              <p className="text-ink-2 mt-2">
                Pools, schedules, referees, brackets, and standings — generated,
                not spreadsheet-ed. Edit once and everyone sees it. You run the
                event instead of the paperwork.
              </p>
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">
                For players &amp; fans
              </h2>
              <p className="text-ink-2 mt-2">
                Your next match, court, opponent, and referee — plus the live
                standings — on your phone, in the sun. No login needed to follow
                along.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-5xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
              Built for the sport, not “events”
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight">
              Everything a spreadsheet can’t do.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<CalendarDays className="size-5" />}
              title="One-click scheduling"
            >
              Round-robin leagues, snake-drafted tournament pools, and
              single-elim brackets — generated, court-balanced, and time-capped
              for you.
            </Feature>
            <Feature
              icon={<Trophy className="size-5" />}
              title="Standings that don’t cheat"
            >
              The full OVA tiebreaker hierarchy, recomputed live. Tap any
              position to see exactly which step broke the tie.
            </Feature>
            <Feature
              icon={<CircleDot className="size-5" />}
              title="Live on game day"
            >
              A “Now playing” board shows the current game on every court and
              advances the moment a score goes in. Captains score from their
              phone.
            </Feature>
            <Feature
              icon={<Users className="size-5" />}
              title="Every player’s own day"
            >
              A personal Play / Ref / Off strip so anyone sees when they play,
              referee, and get a hydrate-and-rest break.
            </Feature>
            <Feature
              icon={<Link2 className="size-5" />}
              title="A public page players love"
            >
              Pools, schedule, brackets, and teams on one clean, mobile-first
              link. Players bookmark their team and land on their schedule in a
              tap.
            </Feature>
            <Feature
              icon={<Bell className="size-5" />}
              title="Reminders on autopilot"
            >
              Weekly “your matches this week,” confirm-your-score nudges, and
              schedule-change notices go out for you — so you stop being the
              group chat.
            </Feature>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="border-rule bg-paper-raised scroll-mt-20 border-y"
        >
          <div className="mx-auto w-full max-w-5xl px-5 py-16">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                Set up in an evening
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight">
                From empty page to public link in four steps.
              </h2>
            </div>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <Step n={1} title="Create it">
                Pick league or tournament, choose your sport and format, set
                dates, venue, and courts.
              </Step>
              <Step n={2} title="Add teams">
                Add them yourself or open a public registration link. Captains
                claim their roster by email.
              </Step>
              <Step n={3} title="Generate">
                One click builds pools, the schedule, referees and — after pools
                — the bracket.
              </Step>
              <Step n={4} title="Publish">
                Share the link. Scores roll in, standings settle themselves, the
                bracket fills out live.
              </Step>
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
          <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
            Simple, fair pricing
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight">
            Free to build. Pay only when you go live.
          </h2>
          <p className="text-ink-2 mx-auto mt-4 max-w-xl text-lg">
            Set up and preview everything for free. When you publish a live
            event it’s a flat{" "}
            <span className="text-ink font-semibold">$5–$15 per team</span>, per
            season or tournament — bigger events pay less per team. No
            per-registration fee, no cut of your payments.
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-claret-deep text-paper-raised">
          <div className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Give your players the tournament they deserve.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg opacity-90">
              Free to build, quick to launch, and priced so any event can afford
              it.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" variant="secondary">
                <Link href="/signup">Start free →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-rule mx-auto w-full max-w-5xl border-t px-5 py-6">
        <div className="text-ink-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>© 2026 MySportsApp — made in Toronto</span>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink-2">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink-2">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-rule bg-surface rounded-lg border p-5 shadow-sm">
      <div className="bg-claret-tint text-claret-deep grid size-9 place-items-center rounded-md">
        {icon}
      </div>
      <h3 className="font-display mt-3 text-lg font-semibold">{title}</h3>
      <p className="text-ink-2 mt-1.5 text-sm">{children}</p>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="list-none">
      <div className="font-display text-claret text-3xl font-bold">{n}</div>
      <h3 className="font-display mt-2 text-lg font-semibold">{title}</h3>
      <p className="text-ink-2 mt-1 text-sm">{children}</p>
    </li>
  );
}
