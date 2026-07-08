import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarDays, Clock, MapPin } from "lucide-react";

import { getPoolsView, getTournamentDetail } from "@/lib/queries/tournaments";
import { getStandings } from "@/lib/standings/compute";
import { getBrackets } from "@/lib/queries/bracket";
import { getReseedBracket } from "@/lib/queries/reseed-bracket";
import { getDropState } from "@/lib/queries/drops";
import { getCompetitionAdmins } from "@/lib/queries/organizers";
import {
  addCompetitionAdminAction,
  removeCompetitionAdminAction,
} from "@/server/actions/organizers";
import { getTeamRosters } from "@/lib/queries/roster";
import { getOrigin } from "@/lib/utils/url";
import {
  SPORTS,
  describeFormat,
  estimateMatchMinutes,
  findPresetId,
  poolBasePresetId,
} from "@/lib/formats";
import { tournamentFormat } from "@/lib/tournament-formats";
import { EditTournamentSettingsDialog } from "@/components/tournament/edit-tournament-settings-dialog";
import { AddTournamentTeamForm } from "@/components/tournament/add-tournament-team-form";
import { GeneratePoolsPanel } from "@/components/tournament/generate-pools-panel";
import { RebalanceRefsButton } from "@/components/tournament/rebalance-refs-button";
import { ReoptimizeScheduleButton } from "@/components/tournament/reoptimize-schedule-button";
import { RetimeScheduleDialog } from "@/components/tournament/retime-schedule-dialog";
import { GenerateBracketPanel } from "@/components/tournament/generate-bracket-panel";
import {
  BracketTree,
  toBracketScheduleMatch,
} from "@/components/bracket/bracket-tree";
import { ReseedBracket } from "@/components/bracket/reseed-bracket";
import { PoolsDisplay } from "@/components/tournament/pools-display";
import { DropSelectionCard } from "@/components/tournament/drop-selection-card";
import { StandingsGroups } from "@/components/standings/standings-table";
import { ScheduleMatrix } from "@/components/tournament/schedule-matrix";
import { TeamManagementList } from "@/components/team/team-management-list";
import { TournamentPublishControls } from "@/components/tournament/tournament-publish-controls";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { ScoringSettingsCard } from "@/components/scoring/scoring-settings-card";
import { OrganizerManager } from "@/components/organizers/organizer-manager";
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
  const [
    origin,
    poolsView,
    standings,
    brackets,
    reseedBracket,
    dropState,
    rosters,
    coOrgs,
  ] = await Promise.all([
    getOrigin(),
    getPoolsView(tournamentId),
    getStandings(tournamentId),
    getBrackets(tournamentId),
    getReseedBracket(tournamentId),
    getDropState(tournamentId),
    getTeamRosters(tournamentId),
    getCompetitionAdmins(tournamentId),
  ]);
  const poolMatches = poolsView?.schedule ?? [];
  const poolPlayComplete =
    poolMatches.length > 0 &&
    poolMatches.every((m) => m.status === "completed");
  // Pool + bracket matches, for the bracket reschedule dialog's conflict check.
  const allScheduleMatches = [
    ...poolMatches,
    ...brackets
      .flatMap((b) => b.view.rounds.flat())
      .map(toBracketScheduleMatch),
  ];
  // Ref games each team is assigned in pool play (shown on the Teams card).
  const refCountByTeam = new Map<string, number>();
  for (const m of poolMatches) {
    if (m.refTeamId) {
      refCountByTeam.set(
        m.refTeamId,
        (refCountByTeam.get(m.refTeamId) ?? 0) + 1,
      );
    }
  }

  const divisionsWithTeams = t.divisions.map((d) => ({
    id: d.id,
    name: d.name,
    teams: t.teams
      .filter((tm) => tm.divisionId === d.id)
      .map((tm) => ({ id: tm.id, name: tm.name, seed: tm.seed })),
  }));

  const sportLabel = SPORTS.find((s) => s.value === t.sport)?.label;
  const fmtTime = (hhmm: string) =>
    DateTime.fromFormat(hhmm, "HH:mm").toFormat("h:mm a");
  const windowText =
    t.startTime && t.endTime
      ? `${fmtTime(t.startTime)} – ${fmtTime(t.endTime)}`
      : null;
  const deadlineText = t.registrationDeadline
    ? DateTime.fromISO(t.registrationDeadline, { zone: t.timezone }).toFormat(
        "LLL d, h:mm a",
      )
    : null;
  const divisionName = new Map(t.divisions.map((d) => [d.id, d.name]));

  const structure = tournamentFormat(t.formatTemplate);
  const twoSetRoundRobin = t.poolFormat.bestOf % 2 === 0;
  // Match format + 2-set choice lock once any score exists (editing them could
  // invalidate recorded results).
  const hasScores =
    poolMatches.some((m) => m.sets.length > 0) ||
    brackets.some((b) =>
      b.view.rounds
        .flat()
        .some((mt) => mt.homeScore != null || mt.awayScore != null),
    );
  const editInitial = {
    name: t.name,
    startDate: t.startDate ?? "",
    endDate: t.endDate ?? "",
    startTime: t.startTime ?? "09:00",
    endTime: t.endTime ?? "17:00",
    venue: t.venue ?? "",
    courts: t.courts,
    gamesPerTeam: t.gamesPerTeam,
    minutesPerGame: t.minutesPerGame,
    formatId: poolBasePresetId(t.sport, t.poolFormat),
    bracketFormatId: findPresetId(t.sport, t.matchFormat),
    formatTemplate: t.formatTemplate,
    playoffTeams: t.playoffTeams,
    twoSetRoundRobin,
  };
  const setupItems: { label: string; value: string }[] = [
    { label: "Structure", value: structure.label },
    {
      label: "Pool play",
      value: twoSetRoundRobin
        ? `${describeFormat(t.poolFormat)} — 2-set round-robin (1–1 ties allowed)`
        : `${describeFormat(t.poolFormat)} round-robin`,
    },
    { label: "Bracket games", value: describeFormat(t.matchFormat) },
    {
      label: "Games per team",
      value: `${t.gamesPerTeam} pool game${t.gamesPerTeam === 1 ? "" : "s"} (target)`,
    },
    { label: "Courts", value: `${t.courts}` },
    {
      label: "Divisions",
      value: t.divisions.map((d) => d.name).join(", ") || "—",
    },
  ];

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
          <div className="flex flex-wrap items-center gap-2">
            <EditTournamentSettingsDialog
              competitionId={t.id}
              sport={t.sport}
              hasScores={hasScores}
              initial={editInitial}
            />
            <TournamentPublishControls
              competitionId={t.id}
              slug={t.slug}
              status={t.status}
              visibility={t.visibility}
            />
          </div>
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
          {windowText && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {windowText}
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

      {/* Format & setup — what the organizer chose at creation */}
      <Card>
        <CardHeader>
          <CardTitle>Format &amp; setup</CardTitle>
          <CardDescription>{structure.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {setupItems.map((it) => (
              <div key={it.label} className="flex flex-col">
                <dt className="text-ink-2 text-[0.66rem] font-bold tracking-[0.1em] uppercase">
                  {it.label}
                </dt>
                <dd className="text-ink mt-0.5">{it.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

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
            defaultStartTime={t.startTime ?? "09:00"}
            gamesPerTeam={t.gamesPerTeam}
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
                editable
              />
            </CardContent>
          </Card>
          {dropState.teams.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Drop a game</CardTitle>
                <CardDescription>
                  Each team in a flagged pool drops one game from its own
                  standings. The result still counts for the opponent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DropSelectionCard teams={dropState.teams} />
              </CardContent>
            </Card>
          )}
          <Card id="schedule" className="scroll-mt-4">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Pool schedule</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <RetimeScheduleDialog
                    competitionId={t.id}
                    currentMinutes={t.minutesPerGame}
                  />
                  <ReoptimizeScheduleButton competitionId={t.id} />
                  <RebalanceRefsButton competitionId={t.id} />
                </div>
              </div>
              <CardDescription>
                Edit a match to change its time or court. Re-optimizing evens
                out wait times (and repacks courts before play starts), moving
                only not-yet-played games; scores are preserved. Rebalancing
                refs evens out who referees only — times, courts, and scores
                stay put.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleView
                matches={poolsView.schedule}
                timezone={t.timezone}
                editable
                slotMinutes={
                  t.minutesPerGame ?? estimateMatchMinutes(t.poolFormat)
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Matchup grid</CardTitle>
              <CardDescription>
                Who plays whom — a ✓ marks a scheduled game. GP is each
                team&apos;s game count.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleMatrix
                divisions={poolsView.divisions}
                showDivisionHeadings={t.divisions.length > 1}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Standings</CardTitle>
              <CardDescription>
                Live from confirmed scores — the OVA tiebreaker order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StandingsGroups
                groups={standings}
                showDivision={t.divisions.length > 1}
                format={t.poolFormat}
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
              {t.formatTemplate === "champ_consolation"
                ? "Seed teams into the Championship + Consolation brackets."
                : "Seed teams out of pools into a single-elimination bracket."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <GenerateBracketPanel
              competitionId={t.id}
              formatTemplate={t.formatTemplate}
              dropsComplete={dropState.complete}
              pools={standings}
              hasBracket={brackets.length > 0 || !!reseedBracket}
              poolPlayComplete={poolPlayComplete}
              courts={t.courts}
              allowReseed
            />
            {reseedBracket ? (
              <ReseedBracket
                bracket={reseedBracket}
                editable
                timezone={t.timezone}
              />
            ) : (
              brackets.map((b) => (
                <div key={b.track ?? "single"} className="space-y-3">
                  {b.label && (
                    <h4 className="font-display text-lg font-semibold">
                      {b.label}
                    </h4>
                  )}
                  <BracketTree
                    bracket={b.view}
                    editable
                    timezone={t.timezone}
                    allMatches={allScheduleMatches}
                  />
                </div>
              ))
            )}
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
              refCount: poolsView?.hasPools
                ? (refCountByTeam.get(team.id) ?? 0)
                : undefined,
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

      {coOrgs.canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Organizers</CardTitle>
            <CardDescription>
              Add a helper to co-run this tournament only — full access here, no
              access to the rest of the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizerManager
              rows={coOrgs.admins}
              addAction={addCompetitionAdminAction.bind(null, t.id)}
              removeAction={removeCompetitionAdminAction.bind(null, t.id)}
              emptyText="No competition organizers yet. Add one by email."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
