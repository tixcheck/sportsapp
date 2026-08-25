import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CircleDot,
  Link2,
  Trophy,
  Search,
  Users,
} from "lucide-react";

import { getUser } from "@/lib/auth/user";
import { getPlatformCounts } from "@/lib/queries/discover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/marketing/reveal";
import { ScheduleLab } from "@/components/marketing/schedule-lab";
import {
  ScreenshotShowcase,
  type Shot,
} from "@/components/marketing/screenshot-showcase";

/** The demo league every screenshot and link on this page points at. */
const DEMO = "/l/lakeshore-indoor-6s-demo";

const SHOTS: Shot[] = [
  {
    id: "schedule",
    label: "Schedule",
    caption:
      "Every playing night as a tab — it opens on the next one. Results appear the moment a captain confirms them.",
    src: "/shots/schedule.png",
    width: 2000,
    height: 1924,
    alt: "A league schedule page with six playing days as tabs and match cards showing each team's set score, the set-by-set points, and the court.",
    url: "mysportsapp.ca/l/lakeshore-indoor-6s-demo",
  },
  {
    id: "standings",
    label: "Standings",
    caption:
      "Nobody types this. It is derived from confirmed scores — matches won, then set ratio, then point ratio, then head-to-head.",
    src: "/shots/standings.png",
    width: 2000,
    height: 2030,
    alt: "A standings table ranking eight teams by matches won, sets and points, with a column for each week of the season.",
    url: "mysportsapp.ca/l/lakeshore-indoor-6s-demo?tab=standings",
  },
  {
    id: "register",
    label: "Registration",
    caption:
      "The price you set, stated plainly, with both ways to pay it. The cap counts itself down and then opens a waitlist.",
    src: "/shots/register.png",
    width: 2000,
    height: 1914,
    alt: "A registration page showing the night, venue, an entry price of $1,000 per team with a note that players can split it or the captain pays, and a badge reading 2 of 10 spots left.",
    url: "mysportsapp.ca/register/lakeshore-indoor-6s-demo",
  },
];

export default async function HomePage() {
  // Logged-in visitors skip the marketing front door.
  const user = await getUser();
  if (user) redirect("/dashboard");

  const counts = await getPlatformCounts();

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col overflow-x-clip">
      <header className="border-rule bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- marketing logo (crisp SVG wordmark) */}
          <img
            src="/mysportsapp-logo.svg"
            alt="MySportsApp"
            className="h-8 w-auto shrink-0 sm:h-9"
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
        {/* Hero — one headline, then two doors, because both an organizer and a
            player land here and only one of them wants a sales pitch. */}
        <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-14 lg:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
              Leagues · Tournaments · Ladders
            </p>
            <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Everything your league needs, already built.
            </h1>
            <p className="text-ink-2 mx-auto mt-5 max-w-2xl text-lg">
              Scheduling, standings, registration and payments for organizers —
              and a public page your players actually use.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="border-rule bg-surface flex flex-col rounded-xl border p-6 shadow-sm">
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                I run a league
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight">
                Draw a season in a minute.
              </h2>
              <p className="text-ink-2 mt-2 flex-1">
                Round robins, tiers, ladders, pools and brackets across every
                gym you have.{" "}
                <span className="text-ink font-semibold">
                  Free to organize, and you keep every dollar of the fee you
                  set.
                </span>
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/signup">Get started — it&apos;s free</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={DEMO}>See a live league →</Link>
                </Button>
              </div>
              <ul className="mt-5 flex flex-wrap gap-2">
                {["Indoor 6s", "Beach 2s", "Co-ed 4s", "Softball"].map((s) => (
                  <li
                    key={s}
                    className="border-rule bg-paper-raised text-ink-2 rounded-full border px-3 py-1 text-sm"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-rule bg-surface flex flex-col rounded-xl border p-6 shadow-sm">
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                I play in one
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight">
                When do we play, and who&apos;s top?
              </h2>
              <p className="text-ink-2 mt-2 flex-1">
                Find your league and get the schedule and standings.{" "}
                <span className="text-ink font-semibold">
                  No account, no download.
                </span>
              </p>
              {/* A GET form: it works before JavaScript lands, and the result
                  is a URL a player can paste into a team group chat. */}
              <form action="/find" method="get" className="mt-5 flex gap-2">
                <Input
                  name="q"
                  placeholder="Tuesday 6s, Lakeshore…"
                  aria-label="Search leagues, tournaments and venues"
                  className="bg-background"
                />
                <Button type="submit" size="lg">
                  <Search className="size-4" />
                  Find
                </Button>
              </form>
              <p className="text-ink-3 mt-3 text-sm">
                Or{" "}
                <Link href="/find" className="text-claret underline">
                  browse every public event
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* The scheduler, running in the visitor's browser. */}
        <section className="border-rule bg-paper-raised border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                Try it right here
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
                Drag three sliders. Watch a season appear.
              </h2>
              <p className="text-ink-2 mt-4 text-lg">
                This is the scheduler the app actually runs, not a demo of one —
                every team plays every other, spread across your courts, with
                byes handled.
              </p>
            </div>
            <ScheduleLab className="mt-10" />
          </div>
        </section>

        {/* Live counts — measured, not claimed. */}
        <section className="mx-auto w-full max-w-6xl px-5 py-14">
          <dl className="grid grid-cols-2 gap-y-8 text-center sm:grid-cols-4">
            <Count value={counts.teams} label="teams" />
            <Count value={counts.games} label="games scheduled" />
            <Count value={counts.sets} label="sets scored" />
            <Count value={counts.organizations} label="organizations" />
          </dl>
          <p className="text-ink-3 mt-6 text-center text-sm">
            Counted from public events, refreshed every few minutes — not a
            number typed in once. Test and demo events are excluded.
          </p>
        </section>

        {/* What your players see */}
        <section className="border-rule bg-paper-raised border-y">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
            <div className="min-w-0">
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                The player&apos;s view
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
                One link, and the group chat goes quiet.
              </h2>
              <p className="text-ink-2 mt-4 text-lg">
                Schedule, standings and registration on one public page. These
                are real screens from a league running right now.
              </p>
            </div>
            <ScreenshotShowcase shots={SHOTS} />
          </div>
        </section>
        {/* What you stop doing */}
        <section className="border-rule bg-paper-raised border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-14">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              What you stop doing
            </h2>
            <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                [
                  "Rebuilding the schedule by hand",
                  "every time a team drops out or a gym falls through.",
                ],
                [
                  "Chasing scores",
                  "on Tuesday night and typing them into a spreadsheet on Wednesday.",
                ],
                [
                  "Tracking who has paid",
                  "across e-transfers, cash and memory.",
                ],
                [
                  "Answering “when do we play?”",
                  "forty times a week in a group chat.",
                ],
              ].map(([lead, rest], i) => (
                <Reveal
                  key={lead}
                  as="li"
                  delay={i * 70}
                  className="text-ink-2 grid grid-cols-[0.6rem_1fr] items-start gap-3 text-[0.95rem]"
                >
                  <span
                    className="bg-pine mt-2 size-2.5 rounded-[3px]"
                    aria-hidden="true"
                  />
                  <span>
                    <b className="text-ink font-semibold">{lead}</b> {rest}
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
              Built for the sport, not “events”
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
              Everything a spreadsheet can’t do.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              i={0}
              icon={<CalendarDays className="size-5" />}
              title="A season in a minute"
            >
              Round robins, tiers, ladders, pools and brackets — drawn across
              every gym and court you have, balanced and time-capped for you.
            </Feature>
            <Feature
              i={1}
              icon={<Trophy className="size-5" />}
              title="Standings that don’t cheat"
            >
              The full OVA tiebreaker hierarchy, recomputed live from confirmed
              scores. Tap any position to see which step broke the tie.
            </Feature>
            <Feature
              i={2}
              icon={<CircleDot className="size-5" />}
              title="Live on game day"
            >
              A “Now playing” board shows the current game on every court and
              advances the moment a score goes in. Captains score from a phone.
            </Feature>
            <Feature
              i={3}
              icon={<Users className="size-5" />}
              title="Registration that fills itself"
            >
              Team sign-ups and free agents, caps per league or per tier, and a
              waitlist that emails the next team the moment a spot opens.
            </Feature>
            <Feature
              i={4}
              icon={<Link2 className="size-5" />}
              title="A public page players love"
            >
              Schedule, standings, teams and brackets on one mobile-first link —
              no login. It embeds in your own site in your own colours.
            </Feature>
            <Feature
              i={5}
              icon={<Bell className="size-5" />}
              title="Reminders on autopilot"
            >
              Weekly “your matches this week,” confirm-your-score nudges, and
              schedule-change notices go out for you — so you stop being the
              group chat.
            </Feature>
          </div>
        </section>

        {/* The same pages on a phone. */}
        <section>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                On a phone
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
                Where they’ll actually open it.
              </h2>
              <p className="text-ink-2 mt-4 text-lg">
                In a gym, five minutes before serve. Players find their court,
                their opponent and where they sit in the table — without an
                account and without asking you.
              </p>
              <p className="text-ink-2 mt-4">
                The standings table keeps every column on a phone — it scrolls
                sideways in its own box rather than being cut down to fit.
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link href={DEMO}>Open the live league →</Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {[
                {
                  src: "/shots/phone-schedule.png",
                  alt: "The league schedule on a phone, with the playing-day tabs wrapped onto three rows and one match card per row.",
                },
                {
                  src: "/shots/phone-standings.png",
                  alt: "The standings table on a phone, scrolling sideways inside its own box.",
                },
              ].map((phone, i) => (
                <Reveal key={phone.src} delay={i * 120}>
                  <div className="border-rule bg-paper-sunken overflow-hidden rounded-2xl border shadow-lg">
                    <Image
                      src={phone.src}
                      alt={phone.alt}
                      width={780}
                      height={1520}
                      sizes="(min-width: 640px) 280px, 45vw"
                      className="h-auto w-full"
                    />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Money */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
              Money
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
              Set $1,000 a team. Bank $1,000 a team.
            </h2>
            <p className="text-ink-2 mt-4 text-lg">
              Processing and platform fees are added on top, not taken out —
              there is no deposit that arrives short and nothing to explain to
              your treasurer.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <Route
              i={0}
              title="Captain pays the team fee"
              rows={[
                ["Captain pays", "$1,050.78"],
                ["You receive", "$1,000.00"],
                ["Card processing", "$30.77"],
                ["mysportsapp", "$20.01"],
              ]}
              foot="One payment, spot confirmed immediately."
            />
            <Route
              i={1}
              title="Six players split it"
              rows={[
                ["Each player pays", "$175.05"],
                ["You receive", "$1,000.00"],
                ["Card processing", "$32.28"],
                ["mysportsapp", "$18.00"],
              ]}
              foot="Team confirms once the last share lands. No captain fronting $1,000."
            />
            <Route
              i={2}
              title="E-transfer to you"
              rows={[
                ["Team sends", "$1,000.00"],
                ["You receive", "$1,000.00"],
                ["Card processing", "—"],
                ["mysportsapp", "$20.00"],
              ]}
              foot="Straight to your bank. You confirm what arrived; our fee is invoiced separately."
            />
          </div>

          <p className="text-ink-3 mx-auto mt-6 max-w-3xl text-center text-sm">
            Today’s rates: $20 per team, or $3 per player when a team splits it.
            Tournaments and King of the Court are 1% of entry. A free league
            costs nothing. No setup fee, no subscription.
          </p>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="border-rule bg-paper-raised scroll-mt-20 border-y"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
                Set up in an evening
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
                From empty page to public link in four steps.
              </h2>
            </div>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <Step n={1} title="Create it">
                Pick league, tournament or ladder, choose your sport and format,
                set dates, venues and courts.
              </Step>
              <Step n={2} title="Add teams">
                Add them yourself or open a registration link. Captains claim
                their roster by email; free agents sign up on their own.
              </Step>
              <Step n={3} title="Generate">
                One click builds the schedule, the referee rota and — after
                pools — the bracket.
              </Step>
              <Step n={4} title="Publish">
                Share the link. Scores roll in, standings settle themselves, the
                bracket fills out live.
              </Step>
            </ol>
          </div>
        </section>

        {/* The promise */}
        <section className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
          <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
            The promise
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
            If it doesn’t fit your league, it changes.
          </h2>
          <p className="text-ink-2 mx-auto mt-4 max-w-xl text-lg">
            Every league has a rule nobody else has — a tier where the top team
            comes up an hour late so they get a proper break, a pool capped at
            21 rather than 25. Tell us the three exactly-like-this rules and
            you’ll usually have them the same afternoon, not next quarter.
          </p>
        </section>

        {/* Final CTA */}
        <section className="bg-claret-deep text-paper-raised">
          <div className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Give your players the season they deserve.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg opacity-90">
              Free to organize, quick to launch, and you keep every dollar of
              the fee you set.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" variant="secondary">
                <Link href="/signup">Start free →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-rule mx-auto w-full max-w-6xl border-t px-5 py-6">
        <div className="text-ink-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>© 2026 MySportsApp</span>
          <nav className="flex gap-4">
            <Link href="/reviews" className="hover:text-ink-2">
              Reviews
            </Link>
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

function Count({ value, label }: { value: number; label: string }) {
  return (
    <Reveal>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-claret text-4xl font-bold tabular-nums sm:text-5xl">
        {value.toLocaleString("en-CA")}
      </dd>
      <p className="text-ink-2 mt-1 text-sm">{label}</p>
    </Reveal>
  );
}

function Feature({
  i,
  icon,
  title,
  children,
}: {
  i: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={i * 70} className="h-full">
      <div className="border-rule bg-surface group hover:border-claret h-full rounded-lg border p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0">
        <div className="bg-claret-tint text-claret-deep group-hover:bg-claret group-hover:text-paper-raised grid size-9 place-items-center rounded-md transition-colors duration-300">
          {icon}
        </div>
        <h3 className="font-display mt-3 text-lg font-semibold">{title}</h3>
        <p className="text-ink-2 mt-1.5 text-sm">{children}</p>
      </div>
    </Reveal>
  );
}

function Route({
  i,
  title,
  rows,
  foot,
}: {
  i: number;
  title: string;
  rows: [string, string][];
  foot: string;
}) {
  return (
    <Reveal delay={i * 90} className="h-full">
      <div className="border-rule bg-surface flex h-full flex-col rounded-lg border p-5 shadow-sm">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <dl className="mt-4 space-y-2 text-sm tabular-nums">
          {rows.map(([label, value]) => {
            const yours = label === "You receive";
            return (
              <div key={label} className="flex items-baseline justify-between">
                <dt className={yours ? "text-ink font-medium" : "text-ink-2"}>
                  {label}
                </dt>
                <dd
                  className={yours ? "text-pine font-semibold" : "text-ink-2"}
                >
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="text-ink-3 mt-4 text-xs">{foot}</p>
      </div>
    </Reveal>
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
    <Reveal as="li" delay={(n - 1) * 80}>
      <div className="font-display text-claret text-3xl font-bold">{n}</div>
      <h3 className="font-display mt-2 text-lg font-semibold">{title}</h3>
      <p className="text-ink-2 mt-1 text-sm">{children}</p>
    </Reveal>
  );
}
