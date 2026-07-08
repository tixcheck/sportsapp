"use client";

import { useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, List, MapPin, SquarePen, Users } from "lucide-react";

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

/**
 * Group by team: every team's own games (home + away), sorted by time. A match
 * appears under both its teams — this is each team's personal schedule.
 */
function groupByTeam(matches: ScheduleMatch[]): Group[] {
  const map = new Map<string, { name: string; matches: ScheduleMatch[] }>();
  const add = (id: string | null, name: string | null, m: ScheduleMatch) => {
    if (!id) return;
    if (!map.has(id)) map.set(id, { name: name ?? "TBD", matches: [] });
    map.get(id)!.matches.push(m);
  };
  for (const m of matches) {
    add(m.homeTeamId, m.homeTeamName, m);
    add(m.awayTeamId, m.awayTeamName, m);
  }
  return [...map.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, { name, matches: ms }]) => ({
      key: `team:${id}`,
      heading: name,
      matches: [...ms].sort(
        (x, y) =>
          startMillis(x) - startMillis(y) || (x.round ?? 0) - (y.round ?? 0),
      ),
    }));
}

/** Sort by trailing court number ("Court 2" < "Court 10"); TBD courts last. */
function courtRank(court: string): number {
  if (court === "tbd") return Number.MAX_SAFE_INTEGER;
  const m = court.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER - 1;
}

function startMillis(m: ScheduleMatch): number {
  return m.scheduledAt ? DateTime.fromISO(m.scheduledAt).toMillis() : Infinity;
}

/** Admin-only: group by court, ordered by start time within each court. */
function groupByCourt(matches: ScheduleMatch[]): Group[] {
  const map = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    const key = m.court ?? "tbd";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()]
    .sort(
      (a, b) => courtRank(a[0]) - courtRank(b[0]) || a[0].localeCompare(b[0]),
    )
    .map(([court, ms]) => ({
      key: `court:${court}`,
      heading: court === "tbd" ? "Court TBD" : court,
      matches: [...ms].sort((x, y) => startMillis(x) - startMillis(y)),
    }));
}

export function ScheduleView({
  matches,
  timezone,
  editable = false,
  myTeamIds = [],
}: {
  matches: ScheduleMatch[];
  timezone: string;
  editable?: boolean;
  myTeamIds?: string[];
}) {
  const [view, setView] = useState<"list" | "agenda" | "court" | "team">(
    "list",
  );
  const [mineOnly, setMineOnly] = useState(false);
  const canFilterMine = myTeamIds.length > 0;

  // "By date" only makes sense when play spans more than one calendar day; a
  // single-day tournament collapses to one date, so hide it and offer By team.
  const scheduledDates = new Set(
    matches
      .filter((m) => m.scheduledAt)
      .map((m) =>
        DateTime.fromISO(m.scheduledAt!, { zone: timezone }).toFormat(
          "yyyy-MM-dd",
        ),
      ),
  );
  const multiDay = scheduledDates.size > 1;

  if (matches.length === 0) {
    return (
      <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
        No matches scheduled yet.
      </div>
    );
  }

  const shown =
    mineOnly && canFilterMine
      ? matches.filter((m) =>
          [m.homeTeamId, m.awayTeamId, m.refTeamId].some(
            (id) => id && myTeamIds.includes(id),
          ),
        )
      : matches;

  // "By date" can be hidden (single-day); fall back to By round if it was set.
  const effectiveView = view === "agenda" && !multiDay ? "list" : view;
  const groups =
    effectiveView === "court"
      ? groupByCourt(shown)
      : effectiveView === "team"
        ? groupByTeam(shown)
        : effectiveView === "agenda"
          ? groupByDate(shown, timezone)
          : groupByRound(shown, timezone);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted inline-flex rounded-lg p-0.5">
          <ToggleButton
            active={effectiveView === "list"}
            onClick={() => setView("list")}
          >
            <List className="size-4" />
            By round
          </ToggleButton>
          {multiDay && (
            <ToggleButton
              active={view === "agenda"}
              onClick={() => setView("agenda")}
            >
              <CalendarDays className="size-4" />
              By date
            </ToggleButton>
          )}
          <ToggleButton
            active={view === "team"}
            onClick={() => setView("team")}
          >
            <Users className="size-4" />
            By team
          </ToggleButton>
          {editable && (
            <ToggleButton
              active={view === "court"}
              onClick={() => setView("court")}
            >
              <MapPin className="size-4" />
              By court
            </ToggleButton>
          )}
        </div>
        {canFilterMine && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              mineOnly
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            My team
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
          No matches for your team yet.
        </div>
      ) : null}

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
                showAbnormal={editable}
                myTeamIds={myTeamIds}
                trailing={
                  editable ? (
                    <span className="flex items-center gap-3">
                      {m.homeTeamId && m.awayTeamId && (
                        <Link
                          href={`/matches/${m.id}`}
                          className="text-claret inline-flex items-center gap-1 font-medium hover:underline"
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
