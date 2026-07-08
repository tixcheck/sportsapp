"use client";

import { useState } from "react";
import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import type { PoolsView, PublicTournament } from "@/lib/queries/tournaments";
import type { StandingsGroup } from "@/lib/standings/compute";
import type { BracketTrackView } from "@/lib/queries/bracket";
import { PoolsDisplay } from "@/components/tournament/pools-display";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { StandingsGroups } from "@/components/standings/standings-table";
import { BracketTree } from "@/components/bracket/bracket-tree";
import { BracketPreview } from "@/components/bracket/bracket-preview";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A clicked team's own games, pulled from the pool schedule. */
function TeamGames({
  teamId,
  teamName,
  schedule,
  timezone,
}: {
  teamId: string;
  teamName: string;
  schedule: ScheduleMatch[];
  timezone: string;
}) {
  const games = schedule
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort(
      (a, b) =>
        (a.scheduledAt ? Date.parse(a.scheduledAt) : 0) -
          (b.scheduledAt ? Date.parse(b.scheduledAt) : 0) ||
        (a.round ?? 0) - (b.round ?? 0),
    );

  return (
    <div className="border-border bg-surface mt-3 rounded-lg border p-4">
      <p className="font-display mb-2 text-sm font-semibold">
        {teamName} — {games.length} game{games.length === 1 ? "" : "s"}
      </p>
      {games.length === 0 ? (
        <p className="text-muted-foreground text-sm">No games scheduled yet.</p>
      ) : (
        <ol className="divide-border divide-y">
          {games.map((m) => {
            const isHome = m.homeTeamId === teamId;
            const opponent = isHome ? m.awayTeamName : m.homeTeamName;
            const done = m.status === "completed" && m.sets.length > 0;
            const mine = m.sets.filter((s) =>
              isHome ? s.home > s.away : s.away > s.home,
            ).length;
            const theirs = m.sets.filter((s) =>
              isHome ? s.away > s.home : s.home > s.away,
            ).length;
            const when = m.scheduledAt
              ? DateTime.fromISO(m.scheduledAt, { zone: timezone }).toFormat(
                  "LLL d, h:mm a",
                )
              : null;
            return (
              <li
                key={m.id}
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

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-rule bg-paper-raised text-ink-2 rounded-lg border p-8 text-center text-sm">
      {children}
    </div>
  );
}

/** Editorial section header: a serif title on an ink hairline, optional note. */
function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="border-ink flex items-baseline justify-between gap-4 border-b pb-2">
      <h3 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h3>
      {note && (
        <span className="text-ink-2 font-display text-sm italic">{note}</span>
      )}
    </div>
  );
}

export function TournamentTabs({
  tournament,
  poolsView,
  standings,
  brackets,
  myTeamIds = [],
}: {
  tournament: PublicTournament;
  poolsView: PoolsView | null;
  standings: StandingsGroup[];
  brackets: BracketTrackView[];
  myTeamIds?: string[];
}) {
  const multiDivision = tournament.divisions.length > 1;
  const hasPools = !!poolsView?.hasPools;
  const hasSchedule = (poolsView?.schedule.length ?? 0) > 0;
  const schedule = poolsView?.schedule ?? [];
  const tz = poolsView?.timezone ?? tournament.timezone;
  // Which team's games are expanded in the Teams tab (click a team to see them).
  const [openTeam, setOpenTeam] = useState<string | null>(null);

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
            <section className="space-y-4">
              <SectionHead title="Pool draw" note="snake-drafted by seed" />
              <PoolsDisplay
                divisions={poolsView!.divisions}
                showDivisionHeadings={multiDivision}
                myTeamIds={myTeamIds}
              />
            </section>
            <section className="space-y-4">
              <SectionHead title="Standings" />
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

      <TabsContent value="brackets" className="mt-6 space-y-8">
        {brackets.length > 0 ? (
          brackets.map((b) => (
            <section key={b.track ?? "single"} className="space-y-3">
              {b.label && <SectionHead title={b.label} />}
              <BracketTree
                bracket={b.view}
                myTeamIds={myTeamIds}
                timezone={tournament.timezone}
              />
            </section>
          ))
        ) : tournament.playoffTeams && tournament.teams.length >= 2 ? (
          <BracketPreview
            playoffTeams={tournament.playoffTeams}
            availableTeams={tournament.teams.length}
            courts={tournament.courts}
            matchFormat={tournament.matchFormat}
          />
        ) : (
          <Placeholder>The bracket appears after pool play.</Placeholder>
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
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setOpenTeam((cur) => (cur === t.id ? null : t.id))
                      }
                      aria-expanded={openTeam === t.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                        openTeam === t.id
                          ? "border-primary bg-accent"
                          : "border-border bg-surface hover:bg-muted",
                      )}
                    >
                      <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">
                        {initials(t.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {t.name}
                      </span>
                      {myTeamIds.includes(t.id) && <MyTeamBadge />}
                    </button>
                  ))}
                </div>
                {openTeam && teams.some((t) => t.id === openTeam) && (
                  <TeamGames
                    teamId={openTeam}
                    teamName={
                      teams.find((t) => t.id === openTeam)?.name ?? "This team"
                    }
                    schedule={schedule}
                    timezone={tz}
                  />
                )}
              </section>
            );
          })
        )}
      </TabsContent>
    </Tabs>
  );
}
