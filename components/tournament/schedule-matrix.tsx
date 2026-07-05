import type { DivisionPools } from "@/lib/queries/tournaments";
import { cn } from "@/lib/utils";

/**
 * A "who plays whom" matrix per pool: rows and columns are the pool's teams
 * (columns numbered to stay compact), a ✓ marks a scheduled game between two
 * teams, and the last column counts each team's games. Lets the organizer verify
 * at a glance that every team is scheduled against the right opponents (and, for
 * a partial round robin, that nobody plays the same team twice).
 */
export function ScheduleMatrix({
  divisions,
  showDivisionHeadings,
}: {
  divisions: DivisionPools[];
  showDivisionHeadings: boolean;
}) {
  return (
    <div className="space-y-8">
      {divisions.map((dp) =>
        dp.pools.every((p) => p.matches.length === 0) ? null : (
          <section key={dp.division.id} className="space-y-4">
            {showDivisionHeadings && (
              <h3 className="font-display text-lg font-semibold">
                {dp.division.name}
              </h3>
            )}
            {dp.pools.map((pool) => {
              if (pool.matches.length === 0) return null;
              const pos = new Map(pool.teams.map((t, i) => [t.id, i]));
              // opponents[i] = set of column indices team i plays.
              const plays = new Set<string>();
              for (const m of pool.matches) {
                const a = m.homeTeamId ? pos.get(m.homeTeamId) : undefined;
                const b = m.awayTeamId ? pos.get(m.awayTeamId) : undefined;
                if (a != null && b != null) {
                  plays.add(`${a}:${b}`);
                  plays.add(`${b}:${a}`);
                }
              }
              const gamesOf = (i: number) =>
                pool.teams.reduce(
                  (n, _t, j) => n + (plays.has(`${i}:${j}`) ? 1 : 0),
                  0,
                );

              return (
                <div key={pool.id} className="space-y-2">
                  <h4 className="font-display text-sm font-semibold">
                    {pool.name}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="text-sm tabular-nums">
                      <thead>
                        <tr className="text-ink-2 text-[0.66rem] tracking-wide uppercase">
                          <th className="px-2 pb-2 text-left font-bold">
                            Team
                          </th>
                          {pool.teams.map((_t, j) => (
                            <th
                              key={j}
                              className="w-7 px-1 pb-2 text-center font-bold"
                            >
                              {j + 1}
                            </th>
                          ))}
                          <th className="px-2 pb-2 text-center font-bold">
                            GP
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pool.teams.map((t, i) => (
                          <tr
                            key={t.id}
                            className="border-rule h-9 border-b last:border-0"
                          >
                            <td className="max-w-[10rem] truncate px-2">
                              <span className="text-ink-3 mr-1.5 tabular-nums">
                                {i + 1}
                              </span>
                              {t.name}
                            </td>
                            {pool.teams.map((_o, j) => (
                              <td
                                key={j}
                                className={cn(
                                  "text-center",
                                  i === j && "bg-paper-sunken",
                                )}
                              >
                                {i === j ? (
                                  <span className="text-ink-3">·</span>
                                ) : plays.has(`${i}:${j}`) ? (
                                  <span className="text-claret font-semibold">
                                    ✓
                                  </span>
                                ) : (
                                  ""
                                )}
                              </td>
                            ))}
                            <td className="text-ink-2 px-2 text-center font-semibold">
                              {gamesOf(i)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        ),
      )}
    </div>
  );
}
