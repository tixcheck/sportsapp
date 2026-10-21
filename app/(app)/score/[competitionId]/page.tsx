import Link from "next/link";
import { DateTime } from "luxon";
import { SquarePen } from "lucide-react";

import { getScorekeeperNight, type ScoreGame } from "@/lib/queries/scorekeeper";
import { formatCourtLabel } from "@/lib/scheduler/court-label";
import { Button } from "@/components/ui/button";
import { ScrollToGame } from "@/components/scoring/scroll-to-game";
import { gameAnchor } from "@/lib/scoring/return-url";
import { cn } from "@/lib/utils";

export const metadata = { title: "Enter scores" };

/**
 * A scorekeeper's page (0168): one night of a league's games, by start time,
 * each a tap away from its score form. Built for a phone at the gym.
 */
export default async function ScorekeeperPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { competitionId } = await params;
  const { day: requested } = await searchParams;
  const night = await getScorekeeperNight(competitionId, requested ?? null);

  if (!night) {
    return (
      <div className="border-border bg-surface mx-auto max-w-md rounded-lg border p-8 text-center text-sm">
        <p className="text-foreground font-medium">
          You&apos;re not a scorekeeper for this league.
        </p>
        <p className="text-muted-foreground mt-1">
          Ask the league&apos;s convenor to add you under Settings → Admin →
          Scorekeepers.
        </p>
      </div>
    );
  }

  const zone = night.timezone;
  const dayLabel = (d: string) =>
    DateTime.fromISO(d, { zone }).toFormat("ccc, LLL d");
  const time = (iso: string | null) =>
    iso ? DateTime.fromISO(iso, { zone }).toFormat("h:mm a") : "Time TBC";
  const waves = new Map<string, ScoreGame[]>();
  for (const g of night.games) {
    const k = g.at ?? "";
    waves.set(k, [...(waves.get(k) ?? []), g]);
  }
  const done = night.games.filter((g) => g.status === "completed").length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ScrollToGame />
      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {night.role === "scorekeeper" ? "Scorekeeper" : "Organizer"}
        </p>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {night.name}
        </h1>
        {night.day && (
          <p className="text-muted-foreground text-sm tabular-nums">
            {dayLabel(night.day)} · {done} of {night.games.length} scores in
          </p>
        )}
      </div>

      {night.days.length > 1 && (
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {night.days.map((d) => (
            <Link
              key={d}
              href={`/score/${competitionId}?day=${d}`}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-sm whitespace-nowrap",
                d === night.day
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface",
              )}
            >
              {dayLabel(d)}
            </Link>
          ))}
        </nav>
      )}

      {night.games.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-10 text-center text-sm">
          No games scheduled yet. Once the convenor posts the schedule, the
          night&apos;s games show up here.
        </div>
      ) : (
        [...waves.entries()].map(([at, games]) => (
          <section key={at} className="space-y-2">
            <h2 className="text-foreground text-sm font-semibold tabular-nums">
              {time(at || null)}
            </h2>
            <ul className="space-y-2">
              {games.map((g) => (
                <GameRow key={g.id} game={g} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function GameRow({ game: g }: { game: ScoreGame }) {
  const ready = g.home && g.away;
  const final = g.status === "completed";
  return (
    <li
      id={gameAnchor(g.id)}
      className="border-border bg-surface flex scroll-mt-20 items-center justify-between gap-3 rounded-lg border p-3"
    >
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-xs">
          {[g.venue, formatCourtLabel(g.court)].filter(Boolean).join(" · ")}
        </p>
        <p className="text-foreground truncate text-sm font-medium">
          {g.home ?? "TBD"} <span className="text-muted-foreground">vs</span>{" "}
          {g.away ?? "TBD"}
        </p>
        {g.score && (
          <p
            className={cn(
              "text-sm tabular-nums",
              final ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {g.score}
            {!final && " · not submitted"}
          </p>
        )}
      </div>
      {ready ? (
        <Button
          asChild
          size="sm"
          variant={final ? "outline" : "default"}
          className="shrink-0"
        >
          <Link href={`/matches/${g.id}`}>
            <SquarePen className="size-4" />
            {final ? "Edit" : "Enter score"}
          </Link>
        </Button>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs">
          Waiting for teams
        </span>
      )}
    </li>
  );
}
