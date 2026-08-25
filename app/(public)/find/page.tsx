import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, Search } from "lucide-react";

import { SPORTS } from "@/lib/formats";
import { discoverHref, findPublicCompetitions } from "@/lib/queries/discover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Find your league — mysportsapp",
  description:
    "Search public leagues, tournaments and King of the Court events. No account needed.",
};

const SPORT_LABEL = new Map(SPORTS.map((s) => [s.value as string, s.label]));

const TYPE_LABEL: Record<string, string> = {
  league: "League",
  tournament: "Tournament",
  kotc: "King of the Court",
};

/** "2026-09-01" and "2026-10-06" -> "Sep 1 – Oct 6". Plain dates, never UTC. */
function dateRange(start: string | null, end: string | null): string | null {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    const month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][m - 1];
    return `${month} ${d}`;
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return null;
}

/**
 * The player's front door.
 *
 * A plain GET form rather than a client component: search is one field and a
 * button, it must work before JavaScript arrives, and the result is a URL a
 * player can bookmark or paste into their team's group chat.
 */
export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = await findPublicCompetitions(q);

  return (
    <div className="bg-background min-h-svh">
      <header className="border-rule bg-paper-raised border-b">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <Link
            href="/"
            className="text-ink-3 hover:text-ink-2 text-xs font-semibold tracking-[0.16em] uppercase"
          >
            mysportsapp
          </Link>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find your league
          </h1>
          <p className="text-ink-2 mt-2">
            Search by league name or venue. No account needed — schedules and
            standings are public.
          </p>

          <form method="get" className="mt-5 flex gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Tuesday 6s, Lakeshore, Summer Sirens…"
              aria-label="Search leagues, tournaments and venues"
              className="bg-background"
            />
            <Button type="submit">
              <Search className="size-4" />
              Search
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-ink-3 text-sm">
          {q ? (
            <>
              {results.length} result{results.length === 1 ? "" : "s"} for “{q}”
            </>
          ) : (
            <>Every public event, newest first.</>
          )}
        </p>

        {results.length === 0 ? (
          <div className="border-rule bg-paper-raised mt-4 rounded-xl border p-8 text-center">
            <p className="font-display text-lg font-semibold">
              Nothing matched that.
            </p>
            <p className="text-ink-2 mx-auto mt-2 max-w-sm text-sm">
              Try the venue instead of the league name — or ask your captain for
              the link. Private leagues don’t appear here.
            </p>
            {q && (
              <Button asChild variant="outline" className="mt-4">
                <Link href="/find">See every public event</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {results.map((r) => {
              const when = dateRange(r.startDate, r.endDate);
              return (
                <li key={r.id} className="list-none">
                  <Link
                    href={discoverHref(r)}
                    className="border-rule bg-paper-raised hover:border-claret focus-visible:ring-ring block rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-claret text-[0.68rem] font-semibold tracking-[0.12em] uppercase">
                        {SPORT_LABEL.get(r.sport) ?? r.sport} ·{" "}
                        {TYPE_LABEL[r.type] ?? r.type}
                      </span>
                    </div>
                    <p className="font-display mt-1 text-lg font-semibold">
                      {r.name}
                    </p>
                    <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {r.orgName && <span>{r.orgName}</span>}
                      {when && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {when}
                        </span>
                      )}
                      {r.venue && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5" />
                          {r.venue}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
