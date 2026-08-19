"use client";

import { Fragment, useMemo, useState } from "react";
import { Star } from "lucide-react";

import type { PublicLeague } from "@/lib/queries/leagues";
import type { StandingsGroup } from "@/lib/standings/compute";
import type { BracketTrackView } from "@/lib/queries/bracket";
import { estimateMatchMinutes } from "@/lib/formats";
import { useBookmarkedTeams } from "@/lib/hooks/use-bookmarked-teams";
import { cn } from "@/lib/utils";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { TeamGames } from "@/components/schedule/team-games";
import {
  StandingsTable,
  StandingsGroups,
  StandingsLegend,
} from "@/components/standings/standings-table";
import { BracketTree } from "@/components/bracket/bracket-tree";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlayerStatRow } from "@/lib/queries/player-stats";
import type { LadderNight } from "@/lib/queries/ladder-standings";
import { LadderNightStandings } from "@/components/league/ladder-night-standings";
import { PlayerStatsTable } from "@/components/stats/player-stats-table";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function LeagueTabs({
  league,
  standings,
  brackets = [],
  myTeamIds = [],
  scorableMatchIds = [],
  playerStats = [],
  ladderNights = [],
  initialTab,
}: {
  league: PublicLeague;
  standings: StandingsGroup[];
  /** Per-player figures for the Stats tab. Empty hides the tab entirely. */
  playerStats?: PlayerStatRow[];
  /**
   * Per-night tables for a ladder league. Non-empty replaces the season
   * standings, which cannot be fair when teams change tiers every week.
   */
  ladderNights?: LadderNight[];
  brackets?: BracketTrackView[];
  myTeamIds?: string[];
  /** Matches the viewer may score — surfaces "Enter score" on their own games. */
  scorableMatchIds?: string[];
  /** Tab to open on load (e.g. "standings" via ?tab=standings). */
  initialTab?: string;
}) {
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const { bookmarked, toggle } = useBookmarkedTeams(league.id);
  const bookmarkedSet = new Set(bookmarked);

  /**
   * Teams grouped by tier, in tier order, with bookmarked teams floated to the
   * top of each group. A tiered league's Teams tab is otherwise one long
   * alphabetical list in which nobody can find their own division.
   */
  const teamGroups = useMemo(() => {
    // Rebuilt from `bookmarked` inside the memo so the dependency is the array
    // itself, not a Set identity that changes every render.
    const bm = new Set(bookmarked);
    const byBookmark = (a: { id: string }, b: { id: string }) =>
      Number(bm.has(b.id)) - Number(bm.has(a.id));

    if (league.tiers.length === 0) {
      return [
        { id: "__all", name: "", teams: [...league.teams].sort(byBookmark) },
      ];
    }
    const groups = league.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      teams: league.teams
        .filter((t) => t.divisionId === tier.id)
        .sort(byBookmark),
    }));
    // Teams not sorted into a tier yet still have to appear somewhere.
    const unsorted = league.teams.filter((t) => t.divisionId === null);
    if (unsorted.length > 0) {
      groups.push({
        id: "__unsorted",
        name: "Not yet placed",
        teams: [...unsorted].sort(byBookmark),
      });
    }
    return groups.filter((g) => g.teams.length > 0);
  }, [league.teams, league.tiers, bookmarked]);

  const hasPlayoffs = brackets.length > 0;
  const allowed = new Set([
    "schedule",
    "teams",
    "standings",
    ...(playerStats.length > 0 ? ["stats"] : []),
    ...(hasPlayoffs ? ["playoffs"] : []),
  ]);
  const defaultTab =
    initialTab && allowed.has(initialTab) ? initialTab : "schedule";
  return (
    <Tabs defaultValue={defaultTab}>
      <div className="bg-background/90 sticky top-0 z-30 -mx-4 space-y-2 border-b px-4 py-2 backdrop-blur">
        <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
          {league.name}
        </p>
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          {playerStats.length > 0 && (
            <TabsTrigger value="stats">Stats</TabsTrigger>
          )}
          {hasPlayoffs && <TabsTrigger value="playoffs">Playoffs</TabsTrigger>}
        </TabsList>
      </div>

      <TabsContent value="schedule" className="mt-6">
        <ScheduleView
          matches={league.schedule}
          timezone={league.timezone}
          myTeamIds={myTeamIds}
          scorableMatchIds={scorableMatchIds}
          sport={league.sport}
          slotMinutes={estimateMatchMinutes(league.matchFormat)}
        />
      </TabsContent>

      <TabsContent value="teams" className="mt-6 space-y-6">
        {league.teams.length === 0 ? (
          <div className="border-rule bg-paper-raised text-ink-2 rounded-lg border p-8 text-center text-sm">
            No teams yet.
          </div>
        ) : (
          <>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Star className="size-4" />
              Tap a team to see their games. Tap the star to bookmark it — it
              stays pinned here and on the schedule.
            </p>
            {teamGroups.map((g) => (
              <section key={g.id} className="space-y-3">
                {teamGroups.length > 1 && (
                  <h3 className="font-display font-semibold">{g.name}</h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.teams.map((t) => {
                    const isBookmarked = bookmarkedSet.has(t.id);
                    return (
                      <Fragment key={t.id}>
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-lg border p-4 transition-colors",
                            openTeam === t.id
                              ? "border-primary bg-accent"
                              : "border-border bg-surface",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenTeam((cur) => (cur === t.id ? null : t.id))
                            }
                            aria-expanded={openTeam === t.id}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">
                              {initials(t.name)}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {t.name}
                            </span>
                            {myTeamIds.includes(t.id) && <MyTeamBadge />}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(t.id)}
                            aria-pressed={isBookmarked}
                            aria-label={
                              isBookmarked
                                ? `Remove ${t.name} bookmark`
                                : `Bookmark ${t.name}`
                            }
                            className="hover:bg-muted shrink-0 rounded-md p-1.5 transition-colors"
                          >
                            <Star
                              className={cn(
                                "size-5",
                                isBookmarked
                                  ? "fill-primary text-primary"
                                  : "text-muted-foreground",
                              )}
                            />
                          </button>
                        </div>
                        {/* Inside the grid and spanning the row, so the panel
                          opens directly beneath the team you tapped rather
                          than at the bottom of the whole division. */}
                        {openTeam === t.id && (
                          <TeamGames
                            teamId={t.id}
                            teamName={t.name}
                            schedule={league.schedule}
                            timezone={league.timezone}
                            sport={league.sport}
                            className="mt-0 sm:col-span-2 lg:col-span-3"
                          />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </TabsContent>

      {playerStats.length > 0 && (
        <TabsContent value="stats" className="mt-6 space-y-3">
          <p className="text-muted-foreground text-sm">
            Every set each player&apos;s team has played, sorted by net clutch —
            sets won by two points or fewer, minus sets lost the same way. Tap
            any column to re-sort.
          </p>
          <PlayerStatsTable rows={playerStats} />
        </TabsContent>
      )}

      <TabsContent value="standings" className="mt-6 space-y-3">
        {ladderNights.length > 0 ? (
          <LadderNightStandings
            nights={ladderNights}
            timezone={league.timezone}
            format={league.matchFormat}
            sport={league.sport}
            differential={league.tiebreaker === "differential"}
          />
        ) : standings.length > 1 ? (
          <StandingsGroups
            groups={standings}
            showDivision={false}
            myTeamIds={myTeamIds}
            format={league.matchFormat}
            sport={league.sport}
            differential={league.tiebreaker === "differential"}
          />
        ) : (
          <>
            <StandingsTable
              rows={standings[0]?.rows ?? []}
              myTeamIds={myTeamIds}
              format={league.matchFormat}
              sport={league.sport}
              differential={league.tiebreaker === "differential"}
            />
            {(standings[0]?.rows.length ?? 0) > 0 && (
              <StandingsLegend
                format={league.matchFormat}
                sport={league.sport}
                differential={league.tiebreaker === "differential"}
              />
            )}
          </>
        )}
      </TabsContent>

      {hasPlayoffs && (
        <TabsContent value="playoffs" className="mt-6 space-y-6">
          {brackets.map((b) => (
            <div key={b.track ?? "single"} className="space-y-3">
              {b.label && (
                <h4 className="font-display text-lg font-semibold">
                  {b.label}
                </h4>
              )}
              <BracketTree
                bracket={b.view}
                myTeamIds={myTeamIds}
                timezone={league.timezone}
              />
            </div>
          ))}
        </TabsContent>
      )}
    </Tabs>
  );
}
