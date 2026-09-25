import { notFound } from "next/navigation";

import { getDraftPool, type DraftPoolRow } from "@/lib/queries/draft-pool";
import { DEFAULT_GROUP_ORDER } from "@/lib/draft/snake";
import { skillLabel } from "@/lib/sports";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * What a captain sees before picking.
 *
 * Read-only by design. The organizer asked for captains to "see what players
 * are available" so they can choose wisely — not to make picks here, which
 * would need a turn order, a lock, and a rule for what happens when two
 * captains take the same player at the same moment.
 *
 * Contact details are absent because `draft_pool` never returns them: a rival
 * captain has no business with somebody's phone number, and the grade is shown
 * only because picking a balanced side is impossible without it.
 */
export default async function DraftPoolPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const view = await getDraftPool(competitionId);
  // Neither an organizer nor a marked captain. 404 rather than a refusal, so
  // the page does not confirm that this league exists to someone idly trying.
  if (!view) notFound();

  const available = view.rows.filter((r) => r.status === "available");
  const taken = view.rows.filter((r) => r.status === "placed");

  // Grouped by first position, the same rule the draft board uses, because a
  // captain is counting setters and middles rather than reading a list.
  const columns = (() => {
    const byPosition = new Map<string, DraftPoolRow[]>();
    for (const r of available) {
      const key = r.positions[0] ?? "No position given";
      const list = byPosition.get(key);
      if (list) list.push(r);
      else byPosition.set(key, [r]);
    }
    const known = DEFAULT_GROUP_ORDER.filter((p) => byPosition.has(p));
    const rest = [...byPosition.keys()].filter(
      (p) => !(DEFAULT_GROUP_ORDER as readonly string[]).includes(p),
    );
    return [...known, ...rest].map((position) => ({
      position,
      players: byPosition.get(position)!,
    }));
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {view.competitionName}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {available.length} available
          {taken.length > 0 && ` · ${taken.length} already on a team`}
          {view.isOrganizer && " · you are viewing this as the organizer"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who&rsquo;s available</CardTitle>
          <CardDescription>
            Everyone still waiting to be placed, by the position they play
            first. Picks are made with the organizer — this page is to read
            before you choose.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {available.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nobody is waiting to be placed yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map(({ position, players }) => (
                <div
                  key={position}
                  className="border-rule bg-surface flex flex-col gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold">{position}</h2>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {players.length}
                    </span>
                  </div>
                  <ul className="divide-rule divide-y">
                    {players.map((p) => (
                      <li key={p.id} className="py-2">
                        <p className="text-sm font-medium">
                          {p.name}
                          {p.isCaptain && (
                            <span className="bg-paper-sunken text-ink-2 ml-2 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                              Captain
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {skillLabel(p.skillLevel)}
                          {p.positions.length > 1 &&
                            ` · also ${p.positions.slice(1).join(", ")}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {taken.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Already placed</CardTitle>
            <CardDescription>
              On a team already, so not available to pick.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-rule divide-y text-sm">
              {taken.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-2">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {skillLabel(p.skillLevel)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
