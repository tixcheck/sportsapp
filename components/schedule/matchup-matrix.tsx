import type { ScheduleMatch } from "@/lib/queries/leagues";
import { buildMatchupMatrix } from "@/lib/schedule/matchup-matrix";
import { cn } from "@/lib/utils";

/**
 * A who-plays-whom grid: teams down the rows and across the columns (numbered to
 * keep columns narrow), each cell the number of games that pair has together.
 * Lets an organizer confirm at a glance that everyone plays everyone and spot
 * repeats. Scrolls horizontally on small screens.
 */
export function MatchupMatrix({ matches }: { matches: ScheduleMatch[] }) {
  const { teams, counts, everyonePlaysEveryone, maxRepeat } =
    buildMatchupMatrix(matches);

  if (teams.length < 2) {
    return (
      <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
        Need at least two teams to show the matchup grid.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            everyonePlaysEveryone
              ? "bg-emerald-100 text-emerald-800"
              : "bg-claret-tint text-claret-deep",
          )}
        >
          {everyonePlaysEveryone
            ? "Everyone plays everyone"
            : "Some pairs never meet"}
        </span>
        {maxRepeat > 1 && (
          <span className="text-muted-foreground text-xs">
            Up to {maxRepeat}× against the same team
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="bg-surface sticky left-0 z-10 p-1.5" />
              {teams.map((t, i) => (
                <th
                  key={t.id}
                  className="text-muted-foreground min-w-[1.9rem] p-1.5 text-center text-xs font-semibold"
                  title={t.name}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((row, i) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="border-border bg-surface sticky left-0 z-10 max-w-[11rem] truncate border-r py-1.5 pr-3 pl-1.5 text-left font-medium whitespace-nowrap"
                >
                  <span className="text-muted-foreground mr-1.5 text-xs">
                    {i + 1}.
                  </span>
                  {row.name}
                </th>
                {teams.map((col, j) => {
                  const n = counts[i][j];
                  const diagonal = i === j;
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        "border-border/60 border-b px-1.5 py-1.5 text-center",
                        diagonal && "bg-muted text-muted-foreground/40",
                        !diagonal && n === 0 && "text-muted-foreground/30",
                        !diagonal &&
                          n === 1 &&
                          "text-foreground bg-emerald-50/60",
                        !diagonal &&
                          n >= 2 &&
                          "bg-claret-tint text-claret-deep font-semibold",
                      )}
                      title={
                        diagonal
                          ? undefined
                          : `${row.name} vs ${col.name}: ${n} game${n === 1 ? "" : "s"}`
                      }
                    >
                      {diagonal ? "·" : n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Each cell is the number of games between that row and column team. A
        green cell means they meet once; claret means a rematch; a faint 0 means
        they never play.
      </p>
    </div>
  );
}
