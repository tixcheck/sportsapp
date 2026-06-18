"use client";

import { useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, List, SquarePen } from "lucide-react";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { cn } from "@/lib/utils";
import { MatchCard } from "./match-card";
import { RescheduleDialog } from "./reschedule-dialog";

type Group = {
  key: string;
  heading: string;
  sub?: string;
  matches: ScheduleMatch[];
};

function groupByRound(matches: ScheduleMatch[], tz: string): Group[] {
  const map = new Map<number, ScheduleMatch[]>();
  for (const m of matches) {
    const r = m.round ?? 0;
    if (!map.has(r)) map.set(r, []);
    map.get(r)!.push(m);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, ms]) => {
      const date = ms.find((m) => m.scheduledAt)?.scheduledAt;
      return {
        key: `r${round}`,
        heading: round ? `Round ${round}` : "Unscheduled",
        sub: date
          ? DateTime.fromISO(date, { zone: tz }).toFormat("cccc, LLL d")
          : undefined,
        matches: ms,
      };
    });
}

function groupByDate(matches: ScheduleMatch[], tz: string): Group[] {
  const map = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    const key = m.scheduledAt
      ? DateTime.fromISO(m.scheduledAt, { zone: tz }).toFormat("yyyy-MM-dd")
      : "tbd";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, ms]) => ({
      key,
      heading:
        key === "tbd"
          ? "Date TBD"
          : DateTime.fromISO(key, { zone: tz }).toFormat("cccc, LLLL d"),
      matches: ms,
    }));
}

export function ScheduleView({
  matches,
  timezone,
  editable = false,
}: {
  matches: ScheduleMatch[];
  timezone: string;
  editable?: boolean;
}) {
  const [view, setView] = useState<"list" | "agenda">("list");

  if (matches.length === 0) {
    return (
      <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
        No matches scheduled yet.
      </div>
    );
  }

  const groups =
    view === "list"
      ? groupByRound(matches, timezone)
      : groupByDate(matches, timezone);

  return (
    <div className="space-y-5">
      <div className="bg-muted inline-flex rounded-lg p-0.5">
        <ToggleButton active={view === "list"} onClick={() => setView("list")}>
          <List className="size-4" />
          By round
        </ToggleButton>
        <ToggleButton
          active={view === "agenda"}
          onClick={() => setView("agenda")}
        >
          <CalendarDays className="size-4" />
          By date
        </ToggleButton>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display font-semibold">{g.heading}</h3>
            {g.sub && (
              <span className="text-muted-foreground text-sm">{g.sub}</span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                timezone={timezone}
                trailing={
                  editable ? (
                    <span className="flex items-center gap-3">
                      {m.homeTeamId && m.awayTeamId && (
                        <Link
                          href={`/matches/${m.id}`}
                          className="text-coral-700 inline-flex items-center gap-1 font-medium hover:underline"
                        >
                          <SquarePen className="size-3.5" />
                          {m.status === "completed"
                            ? "Edit score"
                            : "Enter score"}
                        </Link>
                      )}
                      <RescheduleDialog
                        match={m}
                        allMatches={matches}
                        timezone={timezone}
                      />
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-surface text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
