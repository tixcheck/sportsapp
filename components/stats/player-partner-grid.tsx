import type { PartnerGrid } from "@/lib/stats/partner-grid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Who has played with whom, player by player, for a drafted league.
 *
 * The same reading as the Reverse Pairs grid, so an organizer who knows one
 * knows the other: red is a pairing that has never happened, green one that
 * keeps repeating, and a plain number is the draw doing its job. Counted in
 * NIGHTS on the same team, from saved lineups — so a sub counts, and three
 * games together on one Friday counts once.
 *
 * Rows are numbered rather than named across the top: a 24-wide grid of names
 * is unreadable at any screen size. Every cell carries both names on hover.
 */
export function PlayerPartnerGridCard({ grid }: { grid: PartnerGrid }) {
  const { players, counts, neverTogether, repeats, max } = grid;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who has played with whom</CardTitle>
        <CardDescription>
          Nights each pair has been on the same team, from saved lineups.{" "}
          {players.length >= 2 && (
            <>
              <span className="font-medium">
                {neverTogether.length} pairing
                {neverTogether.length === 1 ? "" : "s"}
              </span>{" "}
              {neverTogether.length === 1 ? "hasn't" : "haven't"} happened yet.{" "}
              {repeats.length > 0 && (
                <>
                  {repeats.length} repeated, most often {max} nights.
                </>
              )}
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {players.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Fills in once lineups have been saved for a night.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0 text-xs tabular-nums">
                <thead>
                  <tr>
                    <th className="bg-surface sticky left-0 z-10 p-1 text-left font-medium">
                      <span className="sr-only">Player</span>
                    </th>
                    {players.map((col, j) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="text-ink-3 w-7 p-1 text-center font-medium"
                        title={col.name}
                      >
                        {j + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((row, i) => (
                    <tr key={row.key}>
                      <th
                        scope="row"
                        className="bg-surface border-rule sticky left-0 z-10 max-w-[11rem] truncate border-r p-1 pr-2 text-left font-medium whitespace-nowrap"
                      >
                        <span className="text-ink-3 mr-1.5">{i + 1}</span>
                        {row.name}
                      </th>
                      {players.map((col, j) => {
                        const n = counts[i][j];
                        const self = i === j;
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "border-rule/50 h-7 w-7 border text-center",
                              self && "bg-paper-sunken",
                              !self && n === 0 && "bg-claret-tint text-claret",
                              !self && n === 1 && "text-ink-3",
                              !self &&
                                n > 1 &&
                                "bg-pine/15 text-pine font-semibold",
                            )}
                            title={
                              self
                                ? undefined
                                : `${row.name} + ${col.name}: ${n}`
                            }
                          >
                            {self ? "" : n}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-ink-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="bg-claret-tint border-rule inline-block size-3 rounded-[2px] border" />
                never together
              </span>
              <span className="flex items-center gap-1.5">
                <span className="border-rule inline-block size-3 rounded-[2px] border" />
                one night
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-pine/15 border-rule inline-block size-3 rounded-[2px] border" />
                two or more
              </span>
            </p>

            {repeats.length > 0 && (
              <div className="text-ink-2 text-xs">
                <p className="mb-1 font-medium">Repeated pairings</p>
                <p>
                  {repeats
                    .slice(0, 12)
                    .map((r) => `${r.a.name} + ${r.b.name} (${r.nights}×)`)
                    .join(" · ")}
                  {repeats.length > 12 && ` · and ${repeats.length - 12} more`}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
