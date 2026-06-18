import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarDays, MapPin } from "lucide-react";

import { getPoolsView, getTournamentDetail } from "@/lib/queries/tournaments";
import { getStandings } from "@/lib/standings/compute";
import { getBracket } from "@/lib/queries/bracket";
import { getTeamRosters } from "@/lib/queries/roster";
import { getOrigin } from "@/lib/utils/url";
import { SPORTS } from "@/lib/formats";
import { AddTournamentTeamForm } from "@/components/tournament/add-tournament-team-form";
import { GeneratePoolsPanel } from "@/components/tournament/generate-pools-panel";
import { GenerateBracketPanel } from "@/components/tournament/generate-bracket-panel";
import { BracketTree } from "@/components/bracket/bracket-tree";
import { PoolsDisplay } from "@/components/tournament/pools-display";
import { TeamManagementList } from "@/components/team/team-management-list";
import { PublishToggle } from "@/components/league/publish-toggle";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { ScoringSettingsCard } from "@/components/scoring/scoring-settings-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ orgId: string; tournamentId: string }>;
}) {
  const { orgId, tournamentId } = await params;
  const t = await getTournamentDetail(tournamentId);
  if (!t || t.orgId !== orgId) notFound();
  const [origin, poolsView, standings, bracket, rosters] = await Promise.all([
    getOrigin(),
    getPoolsView(tournamentId),
    getStandings(tournamentId),
    getBracket(tournamentId),
    getTeamRosters(tournamentId),
  ]);
  const poolMatches = poolsView?.schedule ?? [];
  const poolPlayComplete =
    poolMatches.length > 0 &&
    poolMatches.every((m) => m.status === "completed");

  const divisionsWithTeams = t.divisions.map((d) => ({
    id: d.id,
    name: d.name,
    teams: t.teams
      .filter((tm) => tm.divisionId === d.id)
      .map((tm) => ({ id: tm.id, name: tm.name, seed: tm.seed })),
  }));

  const sportLabel = SPORTS.find((s) => s.value === t.sport)?.label;
  const deadlineText = t.registrationDeadline
    ? DateTime.fromISO(t.registrationDeadline, { zone: t.timezone }).toFormat(
        "LLL d, h:mm a",
      )
    : null;
  const divisionName = new Map(t.divisions.map((d) => [d.id, d.name]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/orgs/${orgId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Back to organization
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
              {t.name}
            </h1>
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium capitalize">
              {t.status === "open" ? "registration open" : t.status}
            </span>
          </div>
          <PublishToggle
            competitionId={t.id}
            status={t.status}
            slug={t.slug}
            kind="tournament"
          />
        </div>
        <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{sportLabel}</span>
          {t.startDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {t.startDate}
              {t.endDate && t.endDate !== t.startDate ? ` → ${t.endDate}` : ""}
            </span>
          )}
          {t.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {t.venue}
            </span>
          )}
          {deadlineText && <span>Registration closes {deadlineText}</span>}
        </p>
      </div>

      {/* Pools */}
      <Card>
        <CardHeader>
          <CardTitle>Pools</CardTitle>
          <CardDescription>
            Seed teams, choose the pool structure, then draw — auto snake-drafts
            by seed (short pools play a double round-robin).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GeneratePoolsPanel
            competitionId={t.id}
            divisions={divisionsWithTeams}
            hasPools={poolsView?.hasPools ?? false}
          />
        </CardContent>
      </Card>

      {poolsView?.hasPools && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Pool draw</CardTitle>
            </CardHeader>
            <CardContent>
              <PoolsDisplay
                divisions={poolsView.divisions}
                showDivisionHeadings={t.divisions.length > 1}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pool schedule</CardTitle>
              <CardDescription>
                Edit a match to change its time or court.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleView
                matches={poolsView.schedule}
                timezone={t.timezone}
                editable
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Bracket */}
      {poolsView?.hasPools && (
        <Card>
          <CardHeader>
            <CardTitle>Bracket</CardTitle>
            <CardDescription>
              Seed teams out of pools into a single-elimination bracket.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <GenerateBracketPanel
              competitionId={t.id}
              pools={standings}
              hasBracket={!!bracket}
              poolPlayComplete={poolPlayComplete}
            />
            {bracket && <BracketTree bracket={bracket} />}
          </CardContent>
        </Card>
      )}

      {/* Teams */}
      <Card>
        <CardHeader>
          <CardTitle>Teams ({t.teams.length})</CardTitle>
          <CardDescription>
            Teams register at the public page, or add one manually with a
            captain&apos;s email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddTournamentTeamForm competitionId={t.id} divisions={t.divisions} />

          <TeamManagementList
            origin={origin}
            teams={t.teams.map((team) => ({
              id: team.id,
              name: team.name,
              divisionName:
                team.divisionId && t.divisions.length > 1
                  ? (divisionName.get(team.divisionId) ?? null)
                  : null,
              status: team.status,
              claimed: !!team.captainUserId,
              invite: team.invite,
              members: rosters[team.id] ?? [],
            }))}
          />
        </CardContent>
      </Card>

      {/* Scoring */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring</CardTitle>
          <CardDescription>
            Who can enter scores, and whether they need confirming.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScoringSettingsCard competitionId={t.id} initial={t.scoring} />
        </CardContent>
      </Card>
    </div>
  );
}
