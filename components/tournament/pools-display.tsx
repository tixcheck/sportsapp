import type { DivisionPools } from "@/lib/queries/tournaments";

export function PoolsDisplay({
  divisions,
  showDivisionHeadings,
}: {
  divisions: DivisionPools[];
  showDivisionHeadings: boolean;
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
              {dp.pools.map((pool) => (
                <div
                  key={pool.id}
                  className="border-border bg-surface rounded-lg border p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-semibold">{pool.name}</h4>
                    {pool.court && (
                      <span className="text-muted-foreground text-xs">
                        {pool.court}
                      </span>
                    )}
                  </div>
                  <ol className="mt-3 space-y-1.5">
                    {pool.teams.map((t, i) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-muted-foreground w-4 text-right tabular-nums">
                          {i + 1}
                        </span>
                        <span className="truncate">{t.name}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-muted-foreground border-border mt-3 border-t pt-2 text-xs">
                    Live standings arrive in a later update.
                  </p>
                </div>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
