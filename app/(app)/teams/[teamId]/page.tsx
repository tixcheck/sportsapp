import Link from "next/link";
import { notFound } from "next/navigation";

import { getTeamView } from "@/lib/queries/team-view";
import { competitionPath } from "@/lib/queries/dashboard";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { MatchSections } from "@/components/scoring/match-sections";
import {
  StandingsTable,
  StandingsLegend,
} from "@/components/standings/standings-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const view = await getTeamView(teamId);
  if (!view) notFound(); // not a member or competition admin

  const {
    team,
    competition,
    isMember,
    myMatches,
    projections,
    teamSchedule,
    standingsGroup,
    differential,
    roster,
  } = view;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={competitionPath(competition.type, competition.slug)}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {competition.name}
        </Link>
        <h1 className="font-display text-foreground mt-1 text-2xl font-semibold tracking-tight">
          {team.name}
        </h1>
      </div>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            Match order is set; times are estimates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isMember ? (
            myMatches.length === 0 && projections.length === 0 ? (
              <p className="text-muted-foreground text-sm">No matches yet.</p>
            ) : (
              <MatchSections matches={myMatches} projections={projections} />
            )
          ) : (
            <ScheduleView
              matches={teamSchedule}
              timezone={competition.timezone}
              myTeamIds={[team.id]}
            />
          )}
        </CardContent>
      </Card>

      {/* Standing */}
      <Card>
        <CardHeader>
          <CardTitle>Standing</CardTitle>
          {standingsGroup?.poolName && (
            <CardDescription>{standingsGroup.poolName}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {standingsGroup ? (
            <div className="space-y-3">
              <StandingsTable
                rows={standingsGroup.rows}
                myTeamIds={[team.id]}
                differential={differential}
              />
              <StandingsLegend differential={differential} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Standings appear once scores come in.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Roster */}
      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No players have joined yet.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {roster.map((m, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground text-xs capitalize">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
