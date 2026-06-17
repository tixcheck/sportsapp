"use client";

import type { PublicLeague } from "@/lib/queries/leagues";
import type { StandingsGroup } from "@/lib/standings/compute";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { StandingsTable } from "@/components/standings/standings-table";
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
}: {
  league: PublicLeague;
  standings: StandingsGroup[];
}) {
  return (
    <Tabs defaultValue="schedule">
      <TabsList>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
        <TabsTrigger value="standings">Standings</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="mt-6">
        <ScheduleView matches={league.schedule} timezone={league.timezone} />
      </TabsContent>

      <TabsContent value="teams" className="mt-6">
        {league.teams.length === 0 ? (
          <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
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
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="standings" className="mt-6">
        <StandingsTable rows={standings[0]?.rows ?? []} />
      </TabsContent>
    </Tabs>
  );
}
