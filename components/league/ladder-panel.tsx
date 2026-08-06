"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, Shuffle, Undo2 } from "lucide-react";

import {
  drawLadderWeekAction,
  lockLadderWeekAction,
  unlockLadderWeekAction,
} from "@/server/actions/ladder";
import type { LadderState } from "@/lib/queries/ladder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The organizer's week-by-week ladder controls.
 *
 * A ladder runs on a two-beat cycle — draw the week, then lock it once the
 * scores are in — because next week's matchups don't exist until this week's
 * results do. The panel always shows which beat you're on.
 */
export function LadderPanel({
  competitionId,
  state,
}: {
  competitionId: string;
  state: LadderState;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const { currentWeek, currentWeekGames, currentWeekComplete } = state;
  const notStarted = currentWeek === 0;
  const drawn = currentWeekGames > 0;

  function run<T extends { error: string } | object>(
    fn: () => Promise<T>,
    onOk: (res: T) => string,
  ) {
    start(async () => {
      const res = await fn();
      if (res && "error" in res) {
        toast.error((res as { error: string }).error);
        return;
      }
      toast.success(onOk(res));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ladder</CardTitle>
        <CardDescription>
          {notStarted
            ? "Draw week 1 to start the ladder. Teams begin in the tier they're in now."
            : drawn && !currentWeekComplete
              ? `Week ${currentWeek} is drawn — ${currentWeekGames} games. Lock it once every score is in.`
              : drawn && currentWeekComplete
                ? `Week ${currentWeek} is complete. Lock it to move teams and draw week ${currentWeek + 1}.`
                : `Week ${currentWeek} has no games yet.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              run(
                () => drawLadderWeekAction(competitionId),
                (r) => {
                  const res = r as {
                    week: number;
                    matchCount: number;
                    shorted: number;
                  };
                  return `Week ${res.week} drawn — ${res.matchCount} games${
                    res.shorted > 0
                      ? `. ${res.shorted} team(s) are one short this week.`
                      : "."
                  }`;
                },
              )
            }
            disabled={pending || (drawn && currentWeekComplete)}
            className="w-full sm:w-auto"
          >
            <Shuffle className="size-4" />
            {notStarted ? "Draw week 1" : `Redraw week ${currentWeek}`}
          </Button>

          {!notStarted && (
            <Button
              variant="outline"
              onClick={() =>
                run(
                  () => lockLadderWeekAction(competitionId, currentWeek),
                  (r) => {
                    const res = r as { nextWeek: number; moves: number };
                    return `Week ${currentWeek} locked — ${res.moves} team(s) moved. Week ${res.nextWeek} is ready to draw.`;
                  },
                )
              }
              disabled={pending || !currentWeekComplete}
              className="w-full sm:w-auto"
            >
              <Lock className="size-4" />
              Lock week {currentWeek}
            </Button>
          )}

          {currentWeek > 1 && (
            <Button
              variant="ghost"
              onClick={() =>
                run(
                  () => unlockLadderWeekAction(competitionId, currentWeek - 1),
                  () => `Week ${currentWeek - 1} unlocked.`,
                )
              }
              disabled={pending}
              className="w-full sm:w-auto"
            >
              <Undo2 className="size-4" />
              Undo last lock
            </Button>
          )}
        </div>

        {state.standingsThisWeek.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.standingsThisWeek.map((tier, i) => {
              const upCount = i > 0 ? (state.swaps[i - 1] ?? 0) : 0;
              const downCount =
                i < state.standingsThisWeek.length - 1
                  ? (state.swaps[i] ?? 0)
                  : 0;
              return (
                <div
                  key={tier.divisionId}
                  className="border-border rounded-lg border p-3"
                >
                  <p className="font-display font-semibold">{tier.name}</p>
                  <p className="text-muted-foreground mb-2 text-xs">
                    {tier.teams.length} teams
                  </p>
                  <ol className="space-y-1 text-sm">
                    {tier.teams.map((t, pos) => {
                      const rising = pos < upCount;
                      const falling = pos >= tier.teams.length - downCount;
                      return (
                        <li
                          key={t.teamId}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            <span className="text-muted-foreground tabular-nums">
                              {pos + 1}.
                            </span>{" "}
                            {t.name}
                          </span>
                          {rising && (
                            <ArrowUp
                              className="size-3.5 shrink-0 text-emerald-600"
                              aria-label="In the promotion places"
                            />
                          )}
                          {falling && (
                            <ArrowDown
                              className="size-3.5 shrink-0 text-amber-600"
                              aria-label="In the relegation places"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Arrows show who&apos;s in the swap places on last week&apos;s order —
          this week&apos;s results decide who actually moves.
        </p>
      </CardContent>
    </Card>
  );
}
