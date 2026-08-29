import { DateTime } from "luxon";

import type {
  ReversePairsGameRow,
  ReversePairsPair,
} from "@/lib/queries/reverse-pairs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The schedule as a player reads it.
 *
 * The same rounds the organizer sees, without the score inputs. Kept separate
 * from the organizer's view rather than passing a flag: this one is read on a
 * phone at the side of a court looking for one's own name, and it can be a
 * server component because nothing here is interactive.
 */
export function PublicReversePairsSchedule({
  games,
  byes,
  timezone = "America/Toronto",
}: {
  games: ReversePairsGameRow[];
  byes: ReversePairsPair[][];
  timezone?: string;
}) {
  const rounds = [...new Set(games.map((g) => g.game))].sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule</CardTitle>
        <CardDescription>
          {rounds.length} rounds, {games.length} games. Three pairs a side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {rounds.map((n, i) => {
          const inRound = games.filter((g) => g.game === n);
          const at = inRound[0]?.scheduledAt;
          return (
            <div key={n} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  Round {n}
                  {at && (
                    <span className="text-ink-3 ml-2 font-normal">
                      {DateTime.fromISO(at, { zone: timezone }).toFormat(
                        "h:mm a",
                      )}
                    </span>
                  )}
                </h3>
                {byes[i] && byes[i].length > 0 && (
                  <p className="text-ink-3 truncate text-xs">
                    Sitting out: {byes[i].map((p) => p.name).join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {inRound.map((g) => {
                  const done = g.scoreA !== null && g.scoreB !== null;
                  const aWon = done && g.scoreA! > g.scoreB!;
                  const bWon = done && g.scoreB! > g.scoreA!;
                  return (
                    <div
                      key={g.id}
                      className="border-rule bg-surface grid gap-2 rounded-lg border p-3 sm:grid-cols-[3.5rem_1fr_auto_1fr]"
                    >
                      <span className="text-ink-3 self-center text-xs font-medium">
                        Court {g.court}
                      </span>
                      <p
                        className={cn(
                          "self-center text-sm",
                          aWon && "font-semibold",
                        )}
                      >
                        {g.sideA.map((p) => p.name).join(" · ")}
                      </p>
                      <p className="self-center text-center text-sm font-semibold tabular-nums">
                        {done ? `${g.scoreA} – ${g.scoreB}` : "vs"}
                      </p>
                      <p
                        className={cn(
                          "self-center text-sm sm:text-right",
                          bWon && "font-semibold",
                        )}
                      >
                        {g.sideB.map((p) => p.name).join(" · ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
