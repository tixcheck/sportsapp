"use client";

import type { PublicLeague } from "@/lib/queries/leagues";
import type { StandingsGroup } from "@/lib/standings/compute";
import type { BracketTrackView } from "@/lib/queries/bracket";
import { ScheduleView } from "@/components/schedule/schedule-view";
import {
  StandingsTable,
  StandingsLegend,
} from "@/components/standings/standings-table";
import { BracketTree } from "@/components/bracket/bracket-tree";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
}: {
  league: PublicLeague;
  standings: StandingsGroup[];
  brackets?: BracketTrackView[];
  myTeamIds?: string[];
}) {
  const hasPlayoffs = brackets.length > 0;
  return (
    <Tabs defaultValue="schedule">
      <div className="bg-background/90 sticky top-0 z-30 -mx-4 space-y-2 border-b px-4 py-2 backdrop-blur">
        <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
          {league.name}
        </p>
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          {hasPlayoffs && <TabsTrigger value="playoffs">Playoffs</TabsTrigger>}
        </TabsList>
      </div>

      <TabsContent value="schedule" className="mt-6">
        <ScheduleView
          matches={league.schedule}
          timezone={league.timezone}
          myTeamIds={myTeamIds}
        />
      </TabsContent>

      <TabsContent value="teams" className="mt-6">
        {league.teams.length === 0 ? (
          <div className="border-rule bg-paper-raised text-ink-2 rounded-lg border p-8 text-center text-sm">
            No teams yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {league.teams.map((t) => (
              <div
                key={t.id}
                className="border-border bg-surface flex items-center gap-3 rounded-lg border p-4"
              >
                <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">
                  {initials(t.name)}
                </span>
                <span className="truncate font-medium">{t.name}</span>
                {myTeamIds.includes(t.id) && <MyTeamBadge />}
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="standings" className="mt-6 space-y-3">
        <StandingsTable rows={standings[0]?.rows ?? []} myTeamIds={myTeamIds} />
        {(standings[0]?.rows.length ?? 0) > 0 && <StandingsLegend />}
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
