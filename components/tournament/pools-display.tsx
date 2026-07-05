import type { DivisionPools } from "@/lib/queries/tournaments";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { NeedsDropToggle } from "@/components/tournament/needs-drop-toggle";

export function PoolsDisplay({
  divisions,
  showDivisionHeadings,
  myTeamIds = [],
  editable = false,
}: {
  divisions: DivisionPools[];
  showDivisionHeadings: boolean;
  myTeamIds?: string[];
  /** Admin view: show the per-pool "drop a game" toggle. */
  editable?: boolean;
}) {
  return (
    <div className="space-y-8">
      {divisions.map((dp) =>
        dp.pools.length === 0 ? null : (
          <section key={dp.division.id} className="space-y-4">
            {showDivisionHeadings && (
              <h3 className="font-display text-lg font-semibold">
                {dp.division.name}
              </h3>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dp.pools.map((pool) => {
                // Regular round robin: 2 games per match ÷ teams = games/team.
                const gamesEach = pool.teams.length
                  ? Math.round((2 * pool.matches.length) / pool.teams.length)
                  : 0;
                return (
                  <div
                    key={pool.id}
                    className="border-rule bg-paper-raised rounded-lg border p-4"
                  >
                    <div className="border-rule flex items-center justify-between gap-2 border-b pb-2">
                      <div>
                        <h4 className="font-display text-lg font-semibold">
                          {pool.name}
                        </h4>
                        <p className="text-ink-3 text-xs tabular-nums">
                          {pool.teams.length} team
                          {pool.teams.length === 1 ? "" : "s"}
                          {pool.matches.length > 0 &&
                            ` · ${gamesEach} game${gamesEach === 1 ? "" : "s"} each`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {pool.court && (
                          <span className="text-ink-2 text-xs tracking-wide uppercase">
                            {pool.court}
                          </span>
                        )}
                        {editable && (
                          <NeedsDropToggle
                            poolId={pool.id}
                            initial={pool.needsDrop}
                          />
                        )}
                      </div>
                    </div>
                    <ol className="mt-2.5 space-y-1.5">
                      {pool.teams.map((t, i) => (
                        <li
                          key={t.id}
                          className="flex items-center gap-2.5 text-sm"
                        >
                          <span className="font-display text-ink-3 w-4 text-right tabular-nums">
                            {i + 1}
                          </span>
                          <span className="truncate">{t.name}</span>
                          {myTeamIds.includes(t.id) && <MyTeamBadge />}
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
