import Link from "next/link";
import { notFound } from "next/navigation";

import { getTeamView } from "@/lib/queries/team-view";
import { competitionPath } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";
import { MyMatchCard } from "@/components/scoring/my-match-card";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { StandingsTable } from "@/components/standings/standings-table";
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
    teamSchedule,
    standingsGroup,
    roster,
  } = view;
  const playing = myMatches.filter((m) => m.role === "play");
  const reffing = myMatches.filter((m) => m.role === "ref");
  // Highlight the team's own next match to play.
  const nextId = isMember
    ? playing.find((m) => m.state !== "final")?.id
    : undefined;

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
            myMatches.length === 0 ? (
              <p className="text-muted-foreground text-sm">No matches yet.</p>
            ) : (
              <>
                {playing.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Playing
                    </h3>
                    {playing.map((m) => (
                      <div key={m.id} className="space-y-1">
                        {m.id === nextId && (
                          <span className="text-coral-700 text-xs font-semibold">
                            Next up
                          </span>
                        )}
                        <div
                          className={cn(
                            m.id === nextId &&
                              "ring-primary/40 rounded-lg ring-2",
                          )}
                        >
                          <MyMatchCard match={m} />
                        </div>
                      </div>
                    ))}
                  </section>
                )}
                {reffing.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Reffing
                    </h3>
                    {reffing.map((m) => (
                      <MyMatchCard key={m.id} match={m} />
                    ))}
                  </section>
                )}
              </>
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
            <StandingsTable rows={standingsGroup.rows} myTeamIds={[team.id]} />
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
