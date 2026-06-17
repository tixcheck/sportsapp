import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarDays, MapPin } from "lucide-react";

import { getPoolsView, getTournamentDetail } from "@/lib/queries/tournaments";
import { getOrigin } from "@/lib/utils/url";
import { SPORTS } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { AddTournamentTeamForm } from "@/components/tournament/add-tournament-team-form";
import { GeneratePoolsPanel } from "@/components/tournament/generate-pools-panel";
import { PoolsDisplay } from "@/components/tournament/pools-display";
import { CopyButton } from "@/components/league/copy-button";
import { PublishToggle } from "@/components/league/publish-toggle";
import { ScheduleView } from "@/components/schedule/schedule-view";
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
  const [origin, poolsView] = await Promise.all([
    getOrigin(),
    getPoolsView(tournamentId),
  ]);

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
            Seed teams, then draw pools ({t.poolSize} teams per pool, snake
            draft by seed).
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

          {t.teams.length > 0 && (
            <ul className="divide-border divide-y">
              {t.teams.map((team) => {
                const claimUrl = team.invite
                  ? `${origin}/claim/${team.invite.token}`
                  : null;
                return (
                  <li
                    key={team.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <span className="font-medium">{team.name}</span>
                      {team.divisionId && t.divisions.length > 1 && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {divisionName.get(team.divisionId)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          team.captainUserId
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {team.captainUserId
                          ? "Captain joined"
                          : team.invite
                            ? `Invite pending · ${team.invite.email}`
                            : "No captain"}
                      </span>
                      {claimUrl && (
                        <CopyButton value={claimUrl} label="Copy invite link" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
