import Link from "next/link";

import type { PlayerProfile } from "@/lib/queries/player-stats";
import { competitionPath } from "@/lib/queries/dashboard";
import { formatPct, formatSigned } from "@/lib/stats/player-stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A player's own record, per league, on their profile.
 *
 * Deliberately the short version — sets, record, win rate and net clutch. The
 * full eleven columns live on the profile page and the league's Stats tab; what
 * belongs here is the answer to "how am I doing", not a spreadsheet.
 */
export function MyStatsCard({ profile }: { profile: PlayerProfile }) {
  if (profile.competitions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your stats</CardTitle>
          <CardDescription>
            Once your team has scores recorded, your record shows up here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const c = profile.career;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your stats</CardTitle>
        <CardDescription>
          {c.gamesPlayed} sets across {profile.competitions.length} league
          {profile.competitions.length === 1 ? "" : "s"} · {c.wins}W–{c.losses}L
          · {formatPct(c.winPct)} won
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="divide-rule divide-y">
          {profile.competitions.map((row) => (
            <li
              key={`${row.competitionId}:${row.teamId}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={competitionPath(row.type, row.slug)}
                  className="hover:text-primary text-sm font-semibold underline-offset-2 hover:underline"
                >
                  {row.competitionName}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {row.teamName} · {row.stats.gamesPlayed} sets ·{" "}
                  {row.stats.wins}W–{row.stats.losses}L
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-4 text-right tabular-nums">
                <div>
                  <p className="font-display text-base">
                    {formatPct(row.stats.winPct, 0)}
                  </p>
                  <p className="text-ink-3 text-[0.65rem] tracking-wide uppercase">
                    won
                  </p>
                </div>
                <div>
                  <p
                    className={cn(
                      "font-display text-base",
                      row.stats.netClutch > 0 && "text-emerald-700",
                      row.stats.netClutch < 0 && "text-rose-700",
                    )}
                    title={`${row.stats.clutchWins} won and ${row.stats.clutchLosses} lost by 2 points or fewer`}
                  >
                    {formatSigned(row.stats.netClutch)}
                  </p>
                  <p className="text-ink-3 text-[0.65rem] tracking-wide uppercase">
                    clutch
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Button asChild variant="outline">
          <Link href={`/players/${profile.userId}`}>
            See the full breakdown
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
