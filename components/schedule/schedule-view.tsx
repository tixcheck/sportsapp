"use client";

import { useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  CalendarDays,
  Grid3x3,
  Layers,
  List,
  MapPin,
  SquarePen,
  Users,
} from "lucide-react";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { cn } from "@/lib/utils";
import { formatPlacement, isMultiVenue } from "@/lib/venues/resolve";
import { normalizeCourtLabel } from "@/lib/scheduler/court-label";
import { MatchCard } from "./match-card";
import { MatchupMatrix } from "./matchup-matrix";
import { NowPlaying } from "./now-playing";
import { RescheduleDialog } from "./reschedule-dialog";
import {
  ActivityStrip,
  OffCard,
  teamScheduleEntries,
  teamTimeline,
} from "./team-timeline";

type Group = {
  key: string;
  heading: string;
  sub?: string;
  matches: ScheduleMatch[];
  /**
   * Rest slots a followed team sits out after this round's duties — rendered as
   * "You're off" cards in the My-team view, in time order between the rounds.
   */
  offRests?: { key: string; name: string; at?: string }[];
};

function groupByRound(matches: ScheduleMatch[], tz: string): Group[] {
  // Matches added mid-season may have no round number. Rather than dumping them
  // all into one "Unscheduled" pile, synthesize a round from each distinct start
  // time (one wave = one round), numbered after the real rounds — so they show
  // as proper "Round N" blocks in time order. No-op when every match has a round.
  const maxRound = matches.reduce((mx, m) => Math.max(mx, m.round ?? 0), 0);
  const synthetic = new Map<string, number>();
  for (const t of [
    ...new Set(
      matches
        .filter((m) => m.round == null && m.scheduledAt)
        .map((m) => m.scheduledAt as string),
    ),
  ].sort()) {
    synthetic.set(t, maxRound + 1 + synthetic.size);
  }
  const roundOf = (m: ScheduleMatch): number =>
    m.round ?? (m.scheduledAt ? synthetic.get(m.scheduledAt)! : 0);

  const map = new Map<number, ScheduleMatch[]>();
  for (const m of matches) {
    const r = roundOf(m);
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
 * By-round groups for the My-team filter, with each rest slot a followed team
 * sits out attached to the round of its preceding duty — so the same per-slot
 * "You're off — Hydrate/Rest" breaks shown in the team-detail views appear here
 * too, in time order between the rounds. Rests come from the full schedule
 * (`all`), which is where the empty game slots between the team's duties live.
 */
function groupByRoundWithOff(
  shown: ScheduleMatch[],
  all: ScheduleMatch[],
  myTeamIds: string[],
  tz: string,
): Group[] {
  const groups = groupByRound(shown, tz);
  const byRound = new Map<number, Group>();
  for (const g of groups) byRound.set(Number(g.key.slice(1)), g);

  const names = teamNames(all);
  for (const teamId of myTeamIds) {
    const name = names.get(teamId) ?? "Your team";
    // Walk the team's day; a rest slot belongs after its preceding duty's round.
    let prevRound: number | null = null;
    for (const t of teamTimeline(teamId, all, tz)) {
      if (t.activity === "off") {
        const g = prevRound != null ? byRound.get(prevRound) : undefined;
        if (g)
          (g.offRests ??= []).push({
            key: `${teamId}-off-${t.at}`,
            name,
            at: t.at,
          });
      } else if (t.round != null) {
        prevRound = t.round;
      }
    }
  }

  return groups;
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

/**
 * Group by tier, top tier first, in time order within each — the way a tiered
 * league's schedule is actually read ("where and when is Tier 2 playing?").
 * Games whose teams aren't sorted into a tier collect at the end.
 */
function groupByTier(matches: ScheduleMatch[], tz: string): Group[] {
  const map = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    const key = m.divisionId ?? "none";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  const orderOf = (ms: ScheduleMatch[]) =>
    ms[0]?.tierOrder ?? Number.MAX_SAFE_INTEGER;
  return [...map.entries()]
    .sort((a, b) => orderOf(a[1]) - orderOf(b[1]))
    .map(([key, ms]) => {
      const sorted = [...ms].sort((x, y) => startMillis(x) - startMillis(y));
      const courts = [
        ...new Set(
          sorted.map((m) => normalizeCourtLabel(m.court)).filter(Boolean),
        ),
      ];
      const date = sorted.find((m) => m.scheduledAt)?.scheduledAt;
      return {
        key: `tier:${key}`,
        heading: sorted[0]?.divisionName ?? "No tier",
        // A tier usually owns one court for the night — say which, since that's
        // the first thing a captain looks for.
        sub: [
          date
            ? DateTime.fromISO(date, { zone: tz }).toFormat("cccc, LLL d")
            : null,
          courts.length === 1 ? `Court ${courts[0]}` : null,
          `${sorted.length} games`,
        ]
          .filter(Boolean)
          .join(" · "),
        matches: sorted,
      };
    });
}

/**
 * Admin-only: group by court, ordered by start time within each court.
 *
 * Keyed on VENUE + label, not the label alone. Every school gym has a "Court
 * A", so a league running six buildings would otherwise collapse six different
 * courts into one column and show them as clashing.
 */
function groupByCourt(matches: ScheduleMatch[], multiVenue: boolean): Group[] {
  const map = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    // Normalize: a league holding both "Court 3" and "3" for the same physical
    // court would otherwise split into two columns.
    const label = normalizeCourtLabel(m.court) ?? "tbd";
    const key = `${m.venueId ?? ""}|${label}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()]
    .map(([key, ms]) => {
      const label = key.slice(key.indexOf("|") + 1);
      const venueName = ms[0]?.venueName ?? null;
      return {
        key: `court:${key}`,
        label,
        venueName,
        heading:
          label === "tbd"
            ? multiVenue && venueName
              ? `${venueName} · Court TBD`
              : "Court TBD"
            : (formatPlacement(label, venueName, { multiVenue }) ?? label),
        matches: [...ms].sort((x, y) => startMillis(x) - startMillis(y)),
      };
    })
    .sort(
      (a, b) =>
        (a.venueName ?? "").localeCompare(b.venueName ?? "") ||
        courtRank(a.label) - courtRank(b.label) ||
        a.label.localeCompare(b.label),
    )
    .map(({ key, heading, matches }) => ({ key, heading, matches }));
}

export function ScheduleView({
  matches,
  timezone,
  editable = false,
  myTeamIds = [],
  scorableMatchIds = [],
  slotMinutes,
}: {
  matches: ScheduleMatch[];
  timezone: string;
  editable?: boolean;
  myTeamIds?: string[];
  /**
   * Matches the viewer may score on a read-only (public) schedule — shows an
   * "Enter score" link on their own games. Ignored when `editable` (the
   * organizer view already shows score entry on every match).
   */
  scorableMatchIds?: string[];
  /** Minutes a game occupies — turns the By-team gaps into real break times. */
  slotMinutes?: number;
}) {
  const scorable = new Set(scorableMatchIds);
  const [view, setView] = useState<
    "list" | "agenda" | "court" | "team" | "tier" | "matrix"
  >("list");
  // Only worth offering when there's more than one tier to separate.
  const tierCount = new Set(matches.map((m) => m.divisionId).filter(Boolean))
    .size;
  const hasTiers = tierCount > 1;
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const canFilterMine = myTeamIds.length > 0;

  const dayOf = (m: ScheduleMatch) =>
    m.scheduledAt
      ? DateTime.fromISO(m.scheduledAt, { zone: timezone }).toFormat(
          "yyyy-MM-dd",
        )
      : null;

  // Distinct playing days (sorted). "By date" and the Day tabs only appear when
  // play spans more than one calendar day.
  const dayDates = [
    ...new Set(matches.map(dayOf).filter((d): d is string => d != null)),
  ].sort();
  const multiDay = dayDates.length > 1;

  if (matches.length === 0) {
    return (
      <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
        No matches scheduled yet.
      </div>
    );
  }

  // A selected Day tab scopes every view to that day; "All days" (null) shows all.
  const activeDay =
    selectedDay && dayDates.includes(selectedDay) ? selectedDay : null;
  const dayScoped = activeDay
    ? matches.filter((m) => dayOf(m) === activeDay)
    : matches;

  const shown =
    mineOnly && canFilterMine
      ? dayScoped.filter((m) =>
          [m.homeTeamId, m.awayTeamId, m.refTeamId].some(
            (id) => id && myTeamIds.includes(id),
          ),
        )
      : dayScoped;

  // "By date" can be hidden (single-day); fall back to By round if it was set.
  const effectiveView =
    view === "agenda" && !multiDay
      ? "list"
      : view === "tier" && !hasTiers
        ? "list"
        : view;

  // By-team always groups the day-scoped schedule so each team's day is complete;
  // the My-team filter then keeps only the followed teams' sections. (Filtering
  // the matches first would fabricate a partial section for every opponent Raj
  // meets — with wrong game counts, rest gaps, and role badges.)
  const teamGroups =
    effectiveView === "team"
      ? mineOnly && canFilterMine
        ? groupByTeam(dayScoped, myTeamIds).filter((g) =>
            myTeamIds.includes(g.key.slice("team:".length)),
          )
        : groupByTeam(dayScoped, myTeamIds)
      : [];

  // Whether this competition genuinely spans buildings — measured from the
  // schedule, so a league with venues on file but only one in use stays clean.
  const multiVenue = isMultiVenue(matches);

  const groups =
    effectiveView === "court"
      ? groupByCourt(shown, multiVenue)
      : effectiveView === "tier"
        ? groupByTier(shown, timezone)
        : effectiveView === "team"
          ? teamGroups
          : effectiveView === "agenda"
            ? groupByDate(shown, timezone)
            : mineOnly && canFilterMine
              ? groupByRoundWithOff(shown, dayScoped, myTeamIds, timezone)
              : groupByRound(shown, timezone);

  const scoreLink = (m: ScheduleMatch) =>
    m.homeTeamId && m.awayTeamId ? (
      <Link
        href={`/matches/${m.id}`}
        className="text-claret inline-flex shrink-0 items-center gap-1 font-medium whitespace-nowrap hover:underline"
      >
        <SquarePen className="size-3.5" />
        {m.status === "completed" ? "Edit score" : "Enter score"}
      </Link>
    ) : null;

  const renderTrailing = (m: ScheduleMatch) => {
    if (editable) {
      // Organizer view: score entry on every match, plus reschedule.
      return (
        <span className="flex items-center gap-3">
          {scoreLink(m)}
          <RescheduleDialog
            match={m}
            allMatches={matches}
            timezone={timezone}
          />
        </span>
      );
    }
    // Public view: "Enter score" only on the viewer's own scorable games.
    return scorable.has(m.id) ? scoreLink(m) : undefined;
  };

  return (
    <div className="space-y-5">
      <NowPlaying matches={matches} timezone={timezone} />
      {multiDay && (
        <div className="border-border flex flex-wrap gap-1.5 border-b pb-3">
          <DayTab
            active={activeDay === null}
            onClick={() => setSelectedDay(null)}
          >
            All days
          </DayTab>
          {dayDates.map((date, i) => (
            <DayTab
              key={date}
              active={activeDay === date}
              onClick={() => setSelectedDay(date)}
            >
              Day {i + 1}
              <span className="opacity-70">
                {" · "}
                {DateTime.fromISO(date, { zone: timezone }).toFormat("LLL d")}
              </span>
            </DayTab>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Wraps rather than `inline-flex`: with four views (organizer) the row
          needs ~375px and only ~311px is available inside the card at 375px,
          so it used to overflow and get clipped.
        */}
        <div className="bg-muted flex max-w-full flex-wrap rounded-lg p-0.5">
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
          {hasTiers && (
            <ToggleButton
              active={effectiveView === "tier"}
              onClick={() => setView("tier")}
            >
              <Layers className="size-4" />
              By tier
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
          {editable && (
            <ToggleButton
              active={view === "matrix"}
              onClick={() => setView("matrix")}
            >
              <Grid3x3 className="size-4" />
              Matrix
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
      {effectiveView === "matrix" && <MatchupMatrix matches={matches} />}

      {effectiveView !== "matrix" && shown.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
          No matches for your team yet.
        </div>
      ) : null}

      {effectiveView !== "matrix" &&
        groups.map((g) =>
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
              multiVenue={multiVenue}
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
              {/*
                minmax(0,…) rather than a bare 1fr: a track sized `auto`/`1fr`
                floors at the item's min-content, and MatchCard's court/ref line
                is `truncate` (white-space: nowrap), whose full untruncated width
                propagates up as min-content. A long ref name therefore widened
                the whole column past the card, where Card's overflow-hidden
                silently sliced the time and actions off. Let the track shrink
                and the truncation does its job.
              */}
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
                {g.matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    timezone={timezone}
                    showAbnormal={editable}
                    myTeamIds={myTeamIds}
                    multiVenue={multiVenue}
                    trailing={renderTrailing(m)}
                  />
                ))}
              </div>
              {g.offRests?.map((o) => (
                <OffCard
                  key={o.key}
                  at={o.at}
                  timezone={timezone}
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
  multiVenue,
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
  multiVenue: boolean;
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
  const timeline = teamTimeline(teamId, allMatches, timezone);
  const entries = teamScheduleEntries(teamId, allMatches, timezone);
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
              showDate
              myTeamIds={myTeamIds}
              multiVenue={multiVenue}
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

/** A Day 1 / Day 2 filter pill (multi-day tournaments). */
function DayTab({
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
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
        // shrink-0 + nowrap so a squeezed row wraps whole buttons rather than
        // breaking each label across two lines ("By" / "round").
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-surface text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
