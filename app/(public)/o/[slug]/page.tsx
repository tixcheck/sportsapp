import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, MapPin, Users } from "lucide-react";
import { DateTime } from "luxon";

import {
  getPublicOrg,
  type PublicOrgCompetition,
} from "@/lib/queries/public-org";
import { SPORTS } from "@/lib/formats";
import { formatCents } from "@/lib/payments/format";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  return {
    title: org ? `${org.name} — leagues and sign-up` : "Leagues",
    description: org
      ? `Everything ${org.name} is running right now, and how to enter.`
      : undefined,
  };
}

/**
 * One page for everything an organization runs.
 *
 * An organizer with four leagues has four links to hand out, and they change
 * every season — so the link they put on a poster or in a newsletter goes stale
 * the moment a season turns over. This one doesn't: whatever is open at the
 * time is what a captain finds.
 *
 * Ordered by what a captain can act on. Open leagues first, because the page
 * exists to be entered from; full ones next, since a waitlist is still an
 * action; closed ones last, where they answer "did I miss it?" rather than
 * taking up the top of the page.
 */
export default async function PublicOrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  if (!org) notFound();

  const rank = (c: PublicOrgCompetition) =>
    c.registrationOpen && (c.spotsLeft === null || c.spotsLeft > 0)
      ? 0
      : c.registrationOpen
        ? 1
        : 2;
  const sorted = [...org.competitions].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
  const openCount = sorted.filter((c) => rank(c) === 0).length;

  return (
    <div className="bg-background min-h-svh">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand logo, fixed height */}
            <img
              src="/mysportsapp-logo.svg"
              alt="MySportsApp"
              className="h-6 w-auto"
            />
          </Link>

          <div className="mt-5 flex items-center gap-3">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- organizer-supplied host
              <img
                src={org.logoUrl}
                alt=""
                className="size-12 rounded-lg object-contain"
              />
            )}
            <div>
              <h1 className="font-display text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
                {org.name}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {openCount > 0
                  ? `${openCount} ${openCount === 1 ? "league is" : "leagues are"} taking sign-ups`
                  : "Nothing is open for sign-up right now."}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        {sorted.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-lg border border-dashed p-8 text-center text-sm">
            Nothing published yet. Check back — or ask {org.name} directly.
          </p>
        ) : (
          sorted.map((c) => <CompetitionRow key={c.id} c={c} />)
        )}
      </main>
    </div>
  );
}

function CompetitionRow({ c }: { c: PublicOrgCompetition }) {
  const sportLabel = SPORTS.find((s) => s.value === c.sport)?.label ?? c.sport;
  const full = c.spotsLeft !== null && c.spotsLeft <= 0;
  const publicPath = c.type === "league" ? `/l/${c.slug}` : `/t/${c.slug}`;

  const when = [
    c.dayOfWeek !== null ? `${DAY[c.dayOfWeek] ?? ""}s` : null,
    c.startTime ? formatTime(c.startTime) : null,
    c.startDate ? formatRange(c.startDate, c.endDate) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="border-border bg-surface rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {sportLabel}
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-balance">
            {c.name}
          </h2>
        </div>

        {/* The number a captain is actually looking for. */}
        <span
          className={
            full
              ? "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : c.registrationOpen
                ? "bg-pine/15 text-pine rounded-full px-2.5 py-1 text-xs font-semibold"
                : "bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-semibold"
          }
        >
          {!c.registrationOpen
            ? "Closed"
            : full
              ? "Full"
              : c.spotsLeft === null
                ? `${c.teamsIn} in`
                : `${c.spotsLeft} of ${c.maxTeams} spots left`}
        </span>
      </div>

      <dl className="text-muted-foreground mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {when && (
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" />
            <dd>{when}</dd>
          </div>
        )}
        {c.venue && (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            <dd className="truncate">{c.venue}</dd>
          </div>
        )}
        {c.feeCents > 0 && (
          <div className="flex items-center gap-2">
            <Users className="size-4 shrink-0" />
            <dd>
              {formatCents(c.feeCents)} per team
              {c.allowIndividualSignups && c.individualFeeCents > 0 && (
                <>
                  {" "}
                  · {formatCents(c.individualFeeCents)} for Indy Registration
                </>
              )}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {c.registrationOpen ? (
          <Button asChild>
            <Link href={`/register/${c.slug}`}>
              {full ? "Join the waitlist" : "Register"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={publicPath}>
            {c.registrationOpen ? "Details" : "Schedule & standings"}
          </Link>
        </Button>

        {c.registrationOpen && c.deadline && !full && (
          <span className="text-muted-foreground text-xs">
            Closes {formatDeadline(c.deadline)}
          </span>
        )}
      </div>
    </section>
  );
}

const DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "18:00" → "6:00 PM". */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  return DateTime.fromObject({ hour: h, minute: m || 0 }).toFormat("h:mm a");
}

function formatRange(start: string, end: string | null): string {
  const s = DateTime.fromISO(start);
  if (!end) return s.toFormat("d LLL yyyy");
  const e = DateTime.fromISO(end);
  return s.year === e.year
    ? `${s.toFormat("d LLL")} – ${e.toFormat("d LLL yyyy")}`
    : `${s.toFormat("d LLL yyyy")} – ${e.toFormat("d LLL yyyy")}`;
}

function formatDeadline(iso: string): string {
  return DateTime.fromISO(iso).toFormat("d LLL");
}
