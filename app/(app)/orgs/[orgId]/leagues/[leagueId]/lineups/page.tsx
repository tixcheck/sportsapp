import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";

import { getLeagueDetail } from "@/lib/queries/leagues";
import { getNightLineups } from "@/lib/queries/lineups";
import { NightLineupCard } from "@/components/stats/night-lineup-card";
import { Button } from "@/components/ui/button";

/**
 * Who played, a night at a time.
 *
 * The input side of appearance-based stats. A drafted league cannot be scored
 * from rosters — people miss weeks and subs fill in — and until this existed the
 * table that reads `match_appearances` had nothing to read.
 *
 * Organised by NIGHT because that is how subbing happens: someone covers the
 * evening, not game four. One lineup here writes a row per game behind the
 * scenes, which is the grain the stats need to credit a late arrival correctly.
 */
export default async function LineupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; leagueId: string }>;
  searchParams: Promise<{ night?: string }>;
}) {
  const { orgId, leagueId } = await params;
  const { night: requested } = await searchParams;

  const league = await getLeagueDetail(leagueId);
  if (!league || league.orgId !== orgId) notFound();

  const timezone = league.timezone ?? "America/Toronto";
  // "Today" in the league's own zone: an organizer in Vancouver filling in a
  // Toronto Tuesday must still land on that Tuesday.
  const today = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");

  const { nights, night, teams } = await getNightLineups(
    leagueId,
    requested ?? null,
    today,
  );

  const label = (d: string) =>
    DateTime.fromISO(d, { zone: timezone }).toFormat("EEE d LLL");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/orgs/${orgId}/leagues/${leagueId}#schedule`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Back to {league.name}
        </Link>
        <h1 className="font-display mt-2 text-2xl font-semibold tracking-tight">
          Who played
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tick the players who turned out. Everyone starts ticked — untick
          anyone who missed the night, and add whoever covered for them.
        </p>
      </div>

      {nights.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed p-8 text-center text-sm">
          Nothing is scheduled yet. Generate the schedule and the nights appear
          here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {nights.map((d) => (
              <Button
                key={d}
                asChild
                size="sm"
                variant={d === night ? "default" : "outline"}
              >
                <Link
                  href={`/orgs/${orgId}/leagues/${leagueId}/lineups?night=${d}`}
                >
                  {label(d)}
                </Link>
              </Button>
            ))}
          </div>

          {teams.length === 0 ? (
            <p className="text-muted-foreground border-border rounded-lg border border-dashed p-8 text-center text-sm">
              No games that night.
            </p>
          ) : (
            <div className="grid gap-4">
              {teams.map((team) => (
                <NightLineupCard
                  key={team.teamId}
                  competitionId={leagueId}
                  night={night!}
                  team={team}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
