import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";

import { getLeagueDetail, getLeagueSchedule } from "@/lib/queries/leagues";
import { getStandings } from "@/lib/standings/compute";
import { getBrackets } from "@/lib/queries/bracket";
import { getTeamRosters } from "@/lib/queries/roster";
import { getCompetitionAdmins } from "@/lib/queries/organizers";
import {
  addCompetitionAdminAction,
  removeCompetitionAdminAction,
} from "@/server/actions/organizers";
import { getOrigin } from "@/lib/utils/url";
import { SPORTS, estimateMatchMinutes, findPresetId } from "@/lib/formats";
import { AddTeamForm } from "@/components/league/add-team-form";
import { EditLeagueSettingsDialog } from "@/components/league/edit-league-settings-dialog";
import { TeamManagementList } from "@/components/team/team-management-list";
import { GenerateScheduleButton } from "@/components/league/generate-schedule-button";
import { LeaguePlayoffPanel } from "@/components/league/league-playoff-panel";
import { PublishToggle } from "@/components/league/publish-toggle";
import { ScheduleView } from "@/components/schedule/schedule-view";
import {
  BracketTree,
  toBracketScheduleMatch,
} from "@/components/bracket/bracket-tree";
import {
  StandingsTable,
  StandingsLegend,
} from "@/components/standings/standings-table";
import { ScoringSettingsCard } from "@/components/scoring/scoring-settings-card";
import { OrganizerManager } from "@/components/organizers/organizer-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ orgId: string; leagueId: string }>;
}) {
  const { orgId, leagueId } = await params;
  const league = await getLeagueDetail(leagueId);
  if (!league || league.orgId !== orgId) notFound();
  const [origin, schedule, standings, rosters, coOrgs, brackets] =
    await Promise.all([
      getOrigin(),
      getLeagueSchedule(leagueId),
      getStandings(leagueId),
      getTeamRosters(leagueId),
      getCompetitionAdmins(leagueId),
      getBrackets(leagueId),
    ]);

  const sportLabel = SPORTS.find((s) => s.value === league.sport)?.label;
  // Regular season done → playoff seeds are final. Pool+bracket matches feed the
  // bracket reschedule dialog's conflict check.
  const seasonComplete =
    schedule.length > 0 && schedule.every((m) => m.status === "completed");
  const allScheduleMatches = [
    ...schedule,
    ...brackets
      .flatMap((b) => b.view.rounds.flat())
      .map(toBracketScheduleMatch),
  ];
  // Match format + 2-set lock once any score exists.
  const hasScores = schedule.some((m) => m.sets.length > 0);
  const editInitial = {
    name: league.name,
    startDate: league.startDate ?? "",
    endDate: league.endDate ?? "",
    venue: league.venue ?? "",
    courts: league.courts,
    roundsPerTeam: league.roundsPerTeam,
    gamesPerTeam: league.gamesPerTeam,
    tiebreaker: league.tiebreaker,
    slotDayOfWeek: league.slotDayOfWeek,
    slotStartTime: league.slotStartTime,
    formatId: findPresetId(league.sport, league.matchFormat),
    twoSetRoundRobin: league.matchFormat.bestOf % 2 === 0,
    blackoutDates: league.blackoutDates,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/orgs/${orgId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Back to leagues
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
              {league.name}
            </h1>
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium capitalize">
              {league.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EditLeagueSettingsDialog
              competitionId={league.id}
              sport={league.sport}
              hasScores={hasScores}
              initial={editInitial}
            />
            <PublishToggle
              competitionId={league.id}
              status={league.status}
              slug={league.slug}
            />
          </div>
        </div>
        <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{sportLabel}</span>
          {league.startDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {league.startDate} → {league.endDate}
            </span>
          )}
          {league.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {league.venue}
            </span>
          )}
        </p>
      </div>

      {/* Schedule */}
      <Card id="schedule" className="scroll-mt-4">
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              {league.matchCount > 0
                ? `${league.matchCount} matches generated.`
                : "No matches yet."}
            </CardDescription>
          </div>
          <GenerateScheduleButton
            competitionId={league.id}
            hasSchedule={league.matchCount > 0}
          />
        </CardHeader>
        {league.teams.length < 2 ? (
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Add at least 2 teams to generate a round-robin schedule.
            </p>
          </CardContent>
        ) : schedule.length > 0 ? (
          <CardContent>
            <ScheduleView
              matches={schedule}
              timezone={league.timezone}
              editable
              slotMinutes={estimateMatchMinutes(league.matchFormat)}
            />
          </CardContent>
        ) : null}
      </Card>

      {/* Standings */}
      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
          <CardDescription>
            Live from confirmed scores — the OVA tiebreaker order.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StandingsTable
            rows={standings[0]?.rows ?? []}
            format={league.matchFormat}
          />
          {(standings[0]?.rows.length ?? 0) > 0 && (
            <StandingsLegend format={league.matchFormat} />
          )}
        </CardContent>
      </Card>

      {/* Playoffs */}
      {league.teams.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Playoffs</CardTitle>
            <CardDescription>
              Seed a playoff bracket from the final standings — single
              elimination, or a Championship + Consolation split.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <LeaguePlayoffPanel
              competitionId={league.id}
              sport={league.sport}
              standings={standings}
              hasBracket={brackets.length > 0}
              seasonComplete={seasonComplete}
              courts={league.courts}
            />
            {brackets.map((b) => (
              <div key={b.track ?? "single"} className="space-y-3">
                {b.label && (
                  <h4 className="font-display text-lg font-semibold">
                    {b.label}
                  </h4>
                )}
                <BracketTree
                  bracket={b.view}
                  editable
                  timezone={league.timezone}
                  allMatches={allScheduleMatches}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Teams */}
      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>
            Add a team with its captain&apos;s email — they get a link to claim
            it and join.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddTeamForm competitionId={league.id} />

          <TeamManagementList
            origin={origin}
            teams={league.teams.map((t) => ({
              id: t.id,
              name: t.name,
              status: t.status,
              claimed: !!t.captain_user_id,
              invite: t.invite
                ? { token: t.invite.token, email: t.invite.email }
                : null,
              members: rosters[t.id] ?? [],
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
          <ScoringSettingsCard
            competitionId={league.id}
            initial={league.scoring}
          />
        </CardContent>
      </Card>

      {coOrgs.canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Organizers</CardTitle>
            <CardDescription>
              Add a helper to co-run this league only — full access here, no
              access to the rest of the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizerManager
              rows={coOrgs.admins}
              addAction={addCompetitionAdminAction.bind(null, league.id)}
              removeAction={removeCompetitionAdminAction.bind(null, league.id)}
              emptyText="No competition organizers yet. Add one by email."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
