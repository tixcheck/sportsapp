import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import type { ReversePairsStanding } from "@/lib/stats/reverse-pairs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Green up, red down, quiet at level — matching the total on the right. */
function diffClass(n: number | null): string {
  if (n === null || n === 0) return "text-ink-3";
  return n > 0 ? "text-pine" : "text-claret";
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * The night's standings, a column per game.
 *
 * A total on its own answers "am I winning" and nothing else. The per-game
 * columns answer the question players actually ask — which of my games went
 * badly — and they are how the organizer's own spreadsheet reads, so the sheet
 * on the wall and the screen say the same thing.
 *
 * Columns are a pair's OWN games in order, not rounds: with more pairs than
 * court space everyone sits out different rounds, and numbering by round would
 * leave each row full of holes at different places.
 */
export function ReversePairsStandingsCard({
  pairs,
  standings,
}: {
  pairs: ReversePairsPair[];
  standings: ReversePairsStanding[];
}) {
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const mostGames = standings.reduce(
    (n, s) => Math.max(n, s.perGame.length),
    0,
  );
  const columns = Array.from({ length: mostGames }, (_, i) => i);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Standings</CardTitle>
        <CardDescription>
          Every pair on a side takes the game&rsquo;s margin, and the totals
          decide the order — so a 25&ndash;23 loss costs far less than a
          25&ndash;12 one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-ink-3 border-rule border-b text-xs">
                {/* Rank rides inside the sticky cell: a separate column
                    before it would slide underneath when scrolled. */}
                <th className="bg-surface sticky left-0 z-10 p-2 text-left font-medium">
                  Pair
                </th>
                {columns.map((i) => (
                  <th key={i} className="w-10 p-2 text-center font-medium">
                    {i + 1}
                  </th>
                ))}
                <th className="p-2 text-right font-medium">W&ndash;L</th>
                <th className="p-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.teamId} className="border-rule/60 border-b">
                  <td className="bg-surface sticky left-0 z-10 p-2 font-medium whitespace-nowrap">
                    <span className="text-ink-3 mr-2 font-normal">
                      {s.rank}
                    </span>
                    {byId.get(s.teamId)?.name ?? "—"}
                  </td>
                  {columns.map((i) => {
                    const n = s.perGame[i] ?? null;
                    const sat = i >= s.perGame.length;
                    return (
                      <td
                        key={i}
                        className={cn("p-2 text-center", diffClass(n))}
                        title={
                          sat
                            ? "No game"
                            : n === null
                              ? "Not scored yet"
                              : `Game ${i + 1}`
                        }
                      >
                        {sat ? "" : n === null ? "·" : signed(n)}
                      </td>
                    );
                  })}
                  <td className="text-ink-3 p-2 text-right whitespace-nowrap">
                    {s.won}&ndash;{s.lost}
                  </td>
                  <td
                    className={cn(
                      "p-2 text-right font-semibold",
                      diffClass(s.differential),
                    )}
                  >
                    {signed(s.differential)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-3 mt-3 text-xs">
          Numbered columns are each pair&rsquo;s own games in order. A dot is a
          game drawn but not yet scored.
        </p>
      </CardContent>
    </Card>
  );
}
