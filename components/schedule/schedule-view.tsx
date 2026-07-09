"use client";

import { useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, List, MapPin, SquarePen, Users } from "lucide-react";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { cn } from "@/lib/utils";
import { MatchCard } from "./match-card";
import { RescheduleDialog } from "./reschedule-dialog";
import {
  ActivityStrip,
  OffCard,
  teamOffRounds,
  teamScheduleEntries,
  teamTimeline,
} from "./team-timeline";

type Group = {
  key: string;
  heading: string;
  sub?: string;
  matches: ScheduleMatch[];
  /** Followed teams sitting out this round — rendered as "off" cards (My-team view). */
  offTeams?: { teamId: string; name: string }[];
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

/** Team id → display name, from every team that appears as home or away. */
function teamNames(matches: ScheduleMatch[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of matches) {
    if (m.homeTeamId) names.set(m.homeTeamId, m.homeTeamName);
    if (m.awayTeamId) names.set(m.awayTeamId, m.awayTeamName);
  }
  return names;
}

/**
 * By-round groups for the My-team filter, with an "off" marker added for each
 * round a followed team neither plays nor refs (within its active window). This
 * keeps the play → off → ref sequence unbroken — without it, an OFF round simply
 * vanishes from the filtered view and the schedule looks like it skips a round.
 * Off rounds are derived from the full schedule (`all`), since the filtered set
 * has no match to hang them on.
 */
function groupByRoundWithOff(
  shown: ScheduleMatch[],
  all: ScheduleMatch[],
  myTeamIds: string[],
  tz: string,
): Group[] {
  const byRound = new Map<number, Group>();
  for (const g of groupByRound(shown, tz))
    byRound.set(Number(g.key.slice(1)), g);

  // Round → date sub, from the full schedule (off rounds have no shown matches).
  const roundSub = new Map<number, string | undefined>();
  for (const m of all) {
    const r = m.round ?? 0;
    if (r <= 0 || roundSub.has(r) || !m.scheduledAt) continue;
    roundSub.set(
      r,
      DateTime.fromISO(m.scheduledAt, { zone: tz }).toFormat("cccc, LLL d"),
    );
  }

  const names = teamNames(all);
  for (const teamId of myTeamIds) {
    for (const round of teamOffRounds(teamId, all)) {
      let g = byRound.get(round);
      if (!g) {
        g = {
          key: `r${round}`,
          heading: `Round ${round}`,
          sub: roundSub.get(round),
          matches: [],
        };
        byRound.set(round, g);
      }
      (g.offTeams ??= []).push({
        teamId,
        name: names.get(teamId) ?? "Your team",
      });
    }
  }

  return [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
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
function groupByTeam(matches: ScheduleMatch[], pinned: string[]): Group[] {
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
  const pinnedSet = new Set(pinned);
  return [...map.entries()]
    .sort(
      (a, b) =>
        // Bookmarked / my teams float to the top, then alphabetical.
        Number(pinnedSet.has(b[0])) - Number(pinnedSet.has(a[0])) ||
        a[1].name.localeCompare(b[1].name),
    )
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

/** Compact gap label: "back-to-back" | "45 min" | "1h 30m" | "2d 3h". */
function formatGap(mins: number): string {
  const r = Math.round(mins);
  if (r <= 0) return "back-to-back";
  if (r < 60) return `${r} min`;
  const days = Math.floor(r / 1440);
  const hours = Math.floor((r % 1440) / 60);
  const m = r % 60;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  return `${hours}h${m ? ` ${m}m` : ""}`;
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
  slotMinutes,
}: {
  matches: ScheduleMatch[];
  timezone: string;
  editable?: boolean;
  myTeamIds?: string[];
  /** Minutes a game occupies — turns the By-team gaps into real break times. */
  slotMinutes?: number;
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

  // By-team always groups the FULL schedule so each team's day is complete;
  // the My-team filter then keeps only the followed teams' sections. (Filtering
  // the matches first would fabricate a partial section for every opponent Raj
  // meets — with wrong game counts, rest gaps, and role badges.)
  const teamGroups =
    effectiveView === "team"
      ? mineOnly && canFilterMine
        ? groupByTeam(matches, myTeamIds).filter((g) =>
            myTeamIds.includes(g.key.slice("team:".length)),
          )
        : groupByTeam(matches, myTeamIds)
      : [];

  const groups =
    effectiveView === "court"
      ? groupByCourt(shown)
      : effectiveView === "team"
        ? teamGroups
        : effectiveView === "agenda"
          ? groupByDate(shown, timezone)
          : mineOnly && canFilterMine
            ? groupByRoundWithOff(shown, matches, myTeamIds, timezone)
            : groupByRound(shown, timezone);

  const renderTrailing = (m: ScheduleMatch) =>
    editable ? (
      <span className="flex items-center gap-3">
        {m.homeTeamId && m.awayTeamId && (
          <Link
            href={`/matches/${m.id}`}
            className="text-claret inline-flex items-center gap-1 font-medium hover:underline"
          >
            <SquarePen className="size-3.5" />
            {m.status === "completed" ? "Edit score" : "Enter score"}
          </Link>
        )}
        <RescheduleDialog match={m} allMatches={matches} timezone={timezone} />
      </span>
    ) : undefined;

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

      {groups.map((g) =>
        effectiveView === "team" ? (
          <TeamDay
            key={g.key}
            teamId={g.key.slice("team:".length)}
            name={g.heading}
            games={g.matches}
            allMatches={matches}
            timezone={timezone}
            slotMinutes={slotMinutes}
            editable={editable}
            myTeamIds={myTeamIds}
            renderTrailing={renderTrailing}
          />
        ) : (
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
                  trailing={renderTrailing(m)}
                />
              ))}
            </div>
            {g.offTeams?.map((o) => (
              <OffCard
                key={`off-${g.key}-${o.teamId}`}
                teamName={myTeamIds.length > 1 ? o.name : undefined}
              />
            ))}
          </section>
        ),
      )}
    </div>
  );
}

/**
 * One team's day in the By-team view: a Play/Ref/OFF strip across their rounds
 * (the at-a-glance plan), a summary (games · refs · time off), then the game
 * cards for detail.
 */
function TeamDay({
  teamId,
  name,
  games,
  allMatches,
  timezone,
  slotMinutes,
  editable,
  myTeamIds,
  renderTrailing,
}: {
  teamId: string;
  name: string;
  games: ScheduleMatch[];
  allMatches: ScheduleMatch[];
  timezone: string;
  slotMinutes?: number;
  editable: boolean;
  myTeamIds: string[];
  renderTrailing: (m: ScheduleMatch) => React.ReactNode;
}) {
  const timeline = teamTimeline(teamId, allMatches);
  const entries = teamScheduleEntries(teamId, allMatches);
  const refCount = timeline.filter((t) => t.activity === "ref").length;
  const offCount = timeline.filter((t) => t.activity === "off").length;
  const pinned = myTeamIds.includes(teamId);
  return (
    <section
      className={cn(
        "space-y-3",
        pinned &&
          "border-primary bg-paper-sunken -mx-2 rounded-lg border px-3 py-3",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-display font-semibold">{name}</h3>
        <span className="text-muted-foreground text-sm">
          {games.length} game{games.length === 1 ? "" : "s"}
          {refCount > 0 ? ` · ${refCount} ref${refCount === 1 ? "" : "s"}` : ""}
          {offCount > 0 && slotMinutes != null
            ? ` · ${formatGap(offCount * slotMinutes)} off`
            : ""}
        </span>
      </div>
      <ActivityStrip timeline={timeline} timezone={timezone} />
      <div className="space-y-2">
        {entries.map((e) =>
          e.kind === "off" ? (
            <OffCard key={e.key} at={e.at} timezone={timezone} />
          ) : (
            <MatchCard
              key={e.key}
              match={e.match!}
              timezone={timezone}
              showAbnormal={editable}
              myTeamIds={myTeamIds}
              // "You play/ref" is the viewer's role — only meaningful in the
              // followed team's own section. Elsewhere let MatchCard derive it,
              // so another team's game isn't mislabelled "You play".
              role={pinned ? (e.kind === "ref" ? "ref" : "play") : undefined}
              trailing={renderTrailing(e.match!)}
            />
          ),
        )}
      </div>
    </section>
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
