import { Trophy } from "lucide-react";

import type { WeightedTable } from "@/lib/queries/weighted-standings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The season table for a ladder, weighted by the tier each week was played in.
 *
 * A ladder moves teams between tiers weekly, so a plain table treats three set
 * wins in the top tier as identical to three in the bottom. This doesn't: a
 * team earns for BEING in a tier that week and more per set won the higher it
 * is, which is the only way a season's nights become comparable.
 *
 * The per-week breakdown is the point, not decoration. "95 points" is a number;
 * "T1 10+15, T1 10+20, T1 10+20, T1 10+0" is the season, and it shows a captain
 * exactly where the total came from — including the week they went down.
 */
export function WeightedStandingsTable({ table }: { table: WeightedTable }) {
  if (table.rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4" />
          Overall standings
        </CardTitle>
        <CardDescription>
          Weighted by the tier each week was played in
          {table.tiers.length > 0 && (
            <>
              {" — "}
              {table.tiers
                .map(
                  (t) => `${t.name}: ${t.base} to play, ${t.perSetWin} a set`,
                )
                .join(" · ")}
            </>
          )}
          .
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground border-rule border-b text-left text-xs tracking-wide uppercase">
                <th className="p-2 font-semibold">#</th>
                <th className="p-2 font-semibold">Team</th>
                <th className="p-2 text-right font-semibold">Points</th>
                <th className="p-2 text-right font-semibold">Sets</th>
                <th className="p-2 font-semibold">By week</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={r.teamId} className="border-rule/60 border-b">
                  <td className="text-muted-foreground p-2">{i + 1}</td>
                  <td className="text-foreground p-2 font-medium">
                    {r.teamName}
                  </td>
                  <td className="p-2 text-right font-semibold">
                    {r.totalPoints}
                  </td>
                  <td className="text-muted-foreground p-2 text-right">
                    {r.totalSetsWon}
                  </td>
                  <td className="p-2">
                    <span className="flex flex-wrap gap-1.5">
                      {[...r.weeks].reverse().map((w) => (
                        <span
                          key={w.week}
                          title={`Week ${w.week} — ${w.tierName}: ${w.base} for playing + ${w.fromWins} from ${w.setsWon} set${w.setsWon === 1 ? "" : "s"}`}
                          className="border-rule text-muted-foreground rounded border px-1.5 py-0.5 text-xs"
                        >
                          {w.tierName.replace(/^Tier /, "T")}{" "}
                          <span className="text-foreground font-medium">
                            {w.total}
                          </span>
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground mt-3 text-xs">
          {table.weeksCounted} week{table.weeksCounted === 1 ? "" : "s"}{" "}
          counted. Hover a week to see how it was made up.
        </p>
      </CardContent>
    </Card>
  );
}
