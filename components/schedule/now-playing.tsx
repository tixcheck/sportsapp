"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { currentGames } from "@/lib/schedule/current-games";

/**
 * "Now playing" — the current game on each court for the day being played.
 * Time-gated: appears 30 min before the day's first game and clears once the
 * day's games are done. Ticks each minute so the window opens without a manual
 * refresh. Shown at the top of the schedule in both organizer and public views.
 */
export function NowPlaying({
  matches,
  timezone,
}: {
  matches: ScheduleMatch[];
  timezone: string;
}) {
  // Only evaluate after mount: the server can't know the viewer's current time,
  // so rendering nothing on the server (and first client paint) avoids a
  // hydration mismatch; the minute tick then keeps the window current.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;

  const games = currentGames(matches, now, timezone);
  if (games.length === 0) return null;

  return (
    <section className="border-claret/30 bg-claret-tint/40 space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-1.5">
        <span className="bg-claret size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
        <h3 className="text-claret-deep font-display text-sm font-semibold">
          Now playing
        </h3>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {games.map(({ court, match }) => (
          <li
            key={court}
            className="bg-surface flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="text-muted-foreground text-xs font-medium">
                {court}
              </span>
              <span className="block truncate font-medium">
                {match.homeTeamName}{" "}
                <span className="text-muted-foreground">vs</span>{" "}
                {match.awayTeamName}
              </span>
            </span>
            {match.status === "in_progress" ? (
              <span className="text-claret shrink-0 text-[0.7rem] font-semibold tracking-wide uppercase">
                Live
              </span>
            ) : match.scheduledAt ? (
              <span className="font-display shrink-0 text-sm tabular-nums">
                {DateTime.fromISO(match.scheduledAt, {
                  zone: timezone,
                }).toFormat("h:mm a")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
