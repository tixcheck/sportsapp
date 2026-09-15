import type { GridPlayer } from "@/lib/stats/partner-grid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** How many names to show before "and N more" — a line, not a paragraph. */
const SHOWN = 8;

/**
 * Who in the draft pool hasn't played with whom — open beside the draft board.
 *
 * The reason a drafted league re-shuffles every session is to put people on a
 * team with everyone. This is the part of the who-played-with-whom grid that
 * matters at the moment of dealing out new teams: for each player, the pool
 * players they have never shared a team with on a night.
 *
 * Players who haven't played yet are named once at the bottom rather than
 * appearing on every line, where "never played with" them would be true of
 * everyone and tell the organizer nothing.
 */
export function NeverTogetherCard({
  entries,
  newcomers,
}: {
  entries: { player: GridPlayer; never: GridPlayer[] }[];
  newcomers: GridPlayer[];
}) {
  if (entries.length === 0 && newcomers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Never played together</CardTitle>
        <CardDescription>
          For each player in the pool, who they haven&apos;t yet been on a team
          with — worth a look before you deal out new teams. From saved lineups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Everyone who has played has shared a team with everyone else in the
            pool.
          </p>
        ) : (
          <ul className="divide-rule divide-y text-sm">
            {entries.map((e) => (
              <li
                key={e.player.key}
                className="flex flex-wrap gap-x-2 gap-y-0.5 py-2"
              >
                <span className="font-medium">{e.player.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {e.never.length}
                </span>
                <span className="text-ink-2 min-w-0 basis-full sm:basis-auto">
                  {e.never
                    .slice(0, SHOWN)
                    .map((x) => x.name)
                    .join(", ")}
                  {e.never.length > SHOWN &&
                    `, and ${e.never.length - SHOWN} more`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {newcomers.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Haven&apos;t played yet: {newcomers.map((x) => x.name).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
