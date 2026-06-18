"use client";

import type { PoolsView, PublicTournament } from "@/lib/queries/tournaments";
import type { StandingsGroup } from "@/lib/standings/compute";
import type { BracketView } from "@/lib/queries/bracket";
import { PoolsDisplay } from "@/components/tournament/pools-display";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { StandingsGroups } from "@/components/standings/standings-table";
import { BracketTree } from "@/components/bracket/bracket-tree";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
      {children}
    </div>
  );
}

export function TournamentTabs({
  tournament,
  poolsView,
  standings,
  bracket,
  myTeamIds = [],
}: {
  tournament: PublicTournament;
  poolsView: PoolsView | null;
  standings: StandingsGroup[];
  bracket: BracketView | null;
  myTeamIds?: string[];
}) {
  const multiDivision = tournament.divisions.length > 1;
  const hasPools = !!poolsView?.hasPools;
  const hasSchedule = (poolsView?.schedule.length ?? 0) > 0;

  const divisions = tournament.divisions.length
    ? tournament.divisions
    : [{ id: "__none", name: "Teams", tierOrder: 0 }];

  return (
    <Tabs defaultValue={hasPools ? "pools" : "teams"}>
      <div className="bg-background/90 sticky top-0 z-30 -mx-4 space-y-2 border-b px-4 py-2 backdrop-blur">
        <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
          {tournament.name}
        </p>
        <TabsList>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="brackets">Brackets</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="pools" className="mt-6 space-y-8">
        {hasPools ? (
          <>
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">Pool draw</h3>
              <PoolsDisplay
                divisions={poolsView!.divisions}
                showDivisionHeadings={multiDivision}
                myTeamIds={myTeamIds}
              />
            </section>
            <section className="space-y-3">
              <h3 className="font-display text-lg font-semibold">Standings</h3>
              <StandingsGroups
                groups={standings}
                showDivision={multiDivision}
                myTeamIds={myTeamIds}
              />
            </section>
          </>
        ) : (
          <Placeholder>
            Pools will appear here once the organizer draws them.
          </Placeholder>
        )}
      </TabsContent>

      <TabsContent value="schedule" className="mt-6">
        {hasSchedule ? (
          <ScheduleView
            matches={poolsView!.schedule}
            timezone={poolsView!.timezone}
            myTeamIds={myTeamIds}
          />
        ) : (
          <Placeholder>
            The pool schedule will appear once pools are drawn.
          </Placeholder>
        )}
      </TabsContent>

      <TabsContent value="brackets" className="mt-6">
        {bracket ? (
          <BracketTree bracket={bracket} myTeamIds={myTeamIds} />
        ) : (
          <Placeholder>
            The single-elimination bracket appears after pool play.
          </Placeholder>
        )}
      </TabsContent>

      <TabsContent value="teams" className="mt-6 space-y-6">
        {tournament.teams.length === 0 ? (
          <Placeholder>No teams registered yet. Be the first!</Placeholder>
        ) : (
          divisions.map((d) => {
            const teams = tournament.teams.filter((t) =>
              d.id === "__none" ? true : t.divisionId === d.id,
            );
            if (teams.length === 0) return null;
            return (
              <section key={d.id} className="space-y-3">
                {multiDivision && (
                  <h3 className="font-display font-semibold">{d.name}</h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {teams.map((t) => (
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
              </section>
            );
          })
        )}
      </TabsContent>
    </Tabs>
  );
}
