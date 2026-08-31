import { DateTime } from "luxon";

import {
  playoffGameLabel,
  playoffSlotSource,
} from "@/lib/scheduler/league-playoff";
import { formatCourtLabel } from "@/lib/scheduler/court-label";
import type { Sport } from "@/lib/formats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface PlayoffScheduleGame {
  id: string;
  track: string | null;
  round: number;
  position: number;
  court: string | null;
  scheduledAt: string | null;
  homeName: string | null;
  awayName: string | null;
  homeSeed: number | null;
  awaySeed: number | null;
  status: string;
  primeCourt: boolean;
}

/**
 * The playoff as it will actually be played: every game, in wave order, with
 * who is in it and where.
 *
 * The bracket tree shows the championship path and nothing else, which makes
 * the half of the field playing placement and consolation games look like it
 * was forgotten. This is the sheet an organizer reads on the night — it has to
 * show all sixteen games or it is not the schedule.
 *
 * Games whose teams are not yet decided say where they come from rather than
 * showing a blank, because "Loser of QF1" is the actual fixture until the
 * quarter-final finishes.
 */
export function PlayoffSchedule({
  games,
  sport,
  timezone,
}: {
  games: PlayoffScheduleGame[];
  sport: Sport;
  timezone: string;
}) {
  if (games.length === 0) return null;

  const finalRound = Math.max(
    ...games.filter((g) => g.track !== "placement").map((g) => g.round),
  );

  /**
   * "1v8" for a championship game whose teams are already settled, so a game
   * feeding off it can name the matchup instead of a bracket number the reader
   * would have to hunt for. Null once the teams are themselves undecided.
   */
  const describeGame = (round: number, position: number): string | null => {
    const g = games.find(
      (x) =>
        x.track === "championship" &&
        x.round === round &&
        x.position === position,
    );
    if (!g || g.homeSeed == null || g.awaySeed == null) return null;
    return `${g.homeSeed}v${g.awaySeed}`;
  };

  // Group by the moment they start: that is a wave, and a wave is how the
  // night is actually run.
  const waves = new Map<string, PlayoffScheduleGame[]>();
  for (const g of games) {
    const key = g.scheduledAt ?? "tbd";
    (waves.get(key) ?? waves.set(key, []).get(key)!).push(g);
  }
  const ordered = [...waves.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Playoff schedule</CardTitle>
        <CardDescription>
          Every game, in the order it&rsquo;s played. Teams not yet decided show
          where they come from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {ordered.map(([key, wave]) => {
          const at =
            key === "tbd" ? null : DateTime.fromISO(key, { zone: timezone });
          return (
            <div key={key} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {at ? at.toFormat("cccc d LLLL") : "Time to be decided"}
                {at && (
                  <span className="text-ink-3 ml-2 font-normal">
                    {at.toFormat("h:mm a")}
                  </span>
                )}
                <span className="text-ink-3 ml-2 text-xs font-normal">
                  {wave.length} game{wave.length === 1 ? "" : "s"}
                </span>
              </h3>

              <div className="space-y-1.5">
                {wave.map((g) => {
                  const label = playoffGameLabel(
                    g.track,
                    g.round,
                    g.position,
                    finalRound,
                  );
                  const from = playoffSlotSource(
                    g.track,
                    g.round,
                    g.position,
                    finalRound,
                    describeGame,
                  );
                  return (
                    <div
                      key={g.id}
                      className={cn(
                        "border-rule bg-surface grid items-center gap-2 rounded-lg border p-2.5 text-sm",
                        "sm:grid-cols-[5.5rem_7rem_1fr_auto_1fr]",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium",
                          g.primeCourt ? "text-claret" : "text-ink-3",
                        )}
                      >
                        {formatCourtLabel(g.court, sport) ?? "—"}
                        {g.primeCourt && " ★"}
                      </span>
                      <span className="text-ink-3 truncate text-xs">
                        {label}
                      </span>
                      <Side
                        name={g.homeName}
                        seed={g.homeSeed}
                        from={from?.home}
                      />
                      <span className="text-ink-3 text-center text-xs">v</span>
                      <Side
                        name={g.awayName}
                        seed={g.awaySeed}
                        from={from?.away}
                        align="right"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="text-ink-3 text-xs">
          ★ marks a prime court. The top seeds&rsquo; games take them.
        </p>
      </CardContent>
    </Card>
  );
}

function Side({
  name,
  seed,
  from,
  align = "left",
}: {
  name: string | null;
  seed: number | null;
  /** Where this team comes from, while the game feeding it is unplayed. */
  from?: string;
  align?: "left" | "right";
}) {
  return (
    <span
      className={cn(
        "truncate",
        align === "right" && "sm:text-right",
        !name && "text-ink-3 italic",
      )}
    >
      {seed != null && (
        <span className="text-ink-3 mr-1.5 text-xs">#{seed}</span>
      )}
      {name ?? from ?? "to be decided"}
    </span>
  );
}
