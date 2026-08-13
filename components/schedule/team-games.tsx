"use client";

import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import {
  ActivityStrip,
  teamScheduleEntries,
  teamTimeline,
} from "@/components/schedule/team-timeline";
import { cn } from "@/lib/utils";

/**
 * One team's own games, pulled out of a competition's schedule.
 *
 * Shared by the public tournament and league pages: a spectator tapping a team
 * name wants the same answer in both places — when do they play, on what court,
 * and how did it go. Lives here rather than in either tabs component so the two
 * cannot drift.
 */
export function TeamGames({
  teamId,
  teamName,
  schedule,
  timezone,
  className,
}: {
  teamId: string;
  teamName: string;
  schedule: ScheduleMatch[];
  timezone: string;
  /** Lets a grid caller span the panel across the full row. */
  className?: string;
}) {
  const entries = teamScheduleEntries(teamId, schedule, timezone);
  const timeline = teamTimeline(teamId, schedule, timezone);
  const playCount = entries.filter((e) => e.kind === "play").length;
  const refCount = entries.filter((e) => e.kind === "ref").length;

  return (
    <div
      className={cn(
        "border-border bg-surface mt-3 space-y-3 rounded-lg border p-4",
        className,
      )}
    >
      <p className="font-display text-sm font-semibold">
        {teamName} — {playCount} game{playCount === 1 ? "" : "s"}
        {refCount > 0 ? ` · ${refCount} ref${refCount === 1 ? "" : "s"}` : ""}
      </p>
      <ActivityStrip timeline={timeline} timezone={timezone} />
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No games scheduled yet.</p>
      ) : (
        <ol className="divide-border divide-y">
          {entries.map((e) => {
            if (e.kind === "off") {
              const restAt = e.at
                ? DateTime.fromISO(e.at, { zone: timezone }).toFormat("h:mm a")
                : null;
              return (
                <li
                  key={e.key}
                  className="text-muted-foreground flex items-center gap-2 py-2 text-xs"
                >
                  {restAt && (
                    <span className="bg-muted rounded px-1.5 py-0.5 font-medium tabular-nums">
                      {restAt}
                    </span>
                  )}
                  You&apos;re off — Hydrate/Rest
                </li>
              );
            }
            const m = e.match!;
            const when = m.scheduledAt
              ? DateTime.fromISO(m.scheduledAt, { zone: timezone }).toFormat(
                  "LLL d, h:mm a",
                )
              : null;
            if (e.kind === "ref") {
              return (
                <li key={e.key} className="min-w-0 py-2 text-sm">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-800 uppercase">
                    Ref
                  </span>
                  <span className="ml-2 font-medium">
                    {m.homeTeamName} vs {m.awayTeamName}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {m.court ?? "Court TBD"}
                    {when ? ` · ${when}` : ""}
                  </span>
                </li>
              );
            }
            const isHome = m.homeTeamId === teamId;
            const opponent = isHome ? m.awayTeamName : m.homeTeamName;
            const done = m.status === "completed" && m.sets.length > 0;
            const mine = m.sets.filter((s) =>
              isHome ? s.home > s.away : s.away > s.home,
            ).length;
            const theirs = m.sets.filter((s) =>
              isHome ? s.away > s.home : s.home > s.away,
            ).length;
            return (
              <li
                key={e.key}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="text-muted-foreground">vs </span>
                  <span className="font-medium">{opponent}</span>
                  <span className="text-muted-foreground block text-xs">
                    {m.court ?? "Court TBD"}
                    {when ? ` · ${when}` : ""}
                  </span>
                </span>
                {done ? (
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      mine > theirs ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {mine}–{theirs}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {m.status === "scheduled" ? "upcoming" : m.status}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
