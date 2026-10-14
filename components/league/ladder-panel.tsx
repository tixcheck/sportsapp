"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, Shuffle, Undo2 } from "lucide-react";

import {
  drawLadderWeekAction,
  lockLadderWeekAction,
  setLadderAutoAdvanceAction,
  unlockLadderWeekAction,
} from "@/server/actions/ladder";
import type { LadderState } from "@/lib/queries/ladder";
import { TierResultsForm } from "@/components/league/ladder-results-entry";
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
  // Shown at once rather than after the refresh lands, and put back if the
  // save is refused.
  const [auto, setAuto] = useState(state.autoAdvance);

  const { currentWeek, currentWeekGames, currentWeekComplete } = state;
  const notStarted = currentWeek === 0;
  const drawn = currentWeekGames > 0;
  // Pinned-grid leagues enter each gym's final standings, not every score.
  const byStandings = state.draw === "pod_grid";
  // BVL locks and draws a ROUND of several weeks at a time (0157); everything
  // the panel says is about the round, and the lock goes on its last week.
  const { round, roundWeeks } = state;
  const byRound = roundWeeks.length > 1;
  const span = byRound
    ? `Round ${round} (weeks ${roundWeeks[0]}–${roundWeeks[roundWeeks.length - 1]})`
    : `Week ${currentWeek}`;
  const unit = byRound ? `round ${round}` : `week ${currentWeek}`;
  const nextUnit = byRound ? `round ${round + 1}` : `week ${currentWeek + 1}`;
  const lockWeek = roundWeeks[roundWeeks.length - 1];
  const tiersEntered = state.standingsThisWeek.filter(
    (t) => t.standingsEntered,
  ).length;

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
            ? byRound
              ? `Draw ${span.toLowerCase()} to start the ladder. Every tier plays its full round robin across the round, then teams move. Teams begin in the tier they're in now.`
              : "Draw week 1 to start the ladder. Teams begin in the tier they're in now."
            : drawn && !currentWeekComplete
              ? byStandings
                ? `Week ${currentWeek} is drawn — ${currentWeekGames} games. Enter each gym's final standings below (${tiersEntered} of ${state.standingsThisWeek.length} done), then lock the week.`
                : auto
                  ? `${span} is drawn — ${currentWeekGames} games. Once every score is in, it locks and ${nextUnit} is drawn by itself the morning after the night.`
                  : `${span} is drawn — ${currentWeekGames} games. Lock it once every score is in.`
              : drawn && currentWeekComplete
                ? `${span} is complete. Lock it to move teams and draw ${nextUnit}.`
                : `Teams are placed for ${byRound ? span.toLowerCase() : unit}. Draw it to make the schedule.`}
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
                  return `${byRound ? `Round ${Math.ceil(res.week / roundWeeks.length)}` : `Week ${res.week}`} drawn — ${res.matchCount} games${
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
            {notStarted
              ? byRound
                ? "Draw round 1"
                : "Draw week 1"
              : drawn
                ? `Redraw ${unit}`
                : `Draw ${unit}`}
          </Button>

          {!notStarted && (
            <Button
              variant="outline"
              onClick={() =>
                run(
                  () => lockLadderWeekAction(competitionId, lockWeek),
                  (r) => {
                    const res = r as { nextWeek: number; moves: number };
                    return byRound
                      ? `Round ${round} locked — ${res.moves} team(s) moved. Round ${round + 1} is ready to draw.`
                      : `Week ${currentWeek} locked — ${res.moves} team(s) moved. Week ${res.nextWeek} is ready to draw.`;
                  },
                )
              }
              disabled={pending || !currentWeekComplete}
              className="w-full sm:w-auto"
            >
              <Lock className="size-4" />
              Lock {unit}
            </Button>
          )}

          {roundWeeks[0] > 1 && (
            <Button
              variant="ghost"
              onClick={() =>
                run(
                  () =>
                    unlockLadderWeekAction(competitionId, roundWeeks[0] - 1),
                  () =>
                    byRound
                      ? `Round ${round - 1} unlocked.`
                      : `Week ${currentWeek - 1} unlocked.`,
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

        {!notStarted && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 size-4 shrink-0"
              checked={auto}
              disabled={pending}
              onChange={(e) => {
                const on = e.target.checked;
                setAuto(on);
                start(async () => {
                  const res = await setLadderAutoAdvanceAction(
                    competitionId,
                    on,
                  );
                  if ("error" in res) {
                    setAuto(!on);
                    toast.error(res.error);
                    return;
                  }
                  toast.success(
                    on
                      ? "Weeks will lock and draw by themselves."
                      : "Automatic lock and draw is off.",
                  );
                  router.refresh();
                });
              }}
            />
            <span>
              <span className="font-medium">Lock and draw automatically</span>
              <span className="text-muted-foreground block">
                The morning after each night, once every{" "}
                {byStandings ? "gym's standings are" : "score is"} in, the{" "}
                {byRound ? "round" : "week"} locks and the next is drawn. Undo
                last lock still works if a score was wrong.
              </span>
            </span>
          </label>
        )}

        {byStandings && drawn && state.standingsThisWeek.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.standingsThisWeek
              .filter((t) => t.teams.length > 0)
              .map((tier) => (
                <TierResultsForm
                  // Remount on a saved change so the form reads the new order.
                  key={`${tier.divisionId}:${currentWeek}:${tier.teams
                    .map((t) => `${t.teamId}${t.resultRank ?? ""}`)
                    .join()}`}
                  competitionId={competitionId}
                  week={currentWeek}
                  tier={tier}
                />
              ))}
          </div>
        )}

        {!(byStandings && drawn) && state.standingsThisWeek.length > 0 && (
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

        {byStandings && drawn ? (
          <p className="text-muted-foreground text-xs">
            The order is what counts: it decides who moves up and down when you
            lock the week. Points are kept as the sheet recorded them.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Arrows show who&apos;s in the swap places on last{" "}
            {byRound ? "round" : "week"}&apos;s order — this{" "}
            {byRound ? "round" : "week"}&apos;s results decide who actually
            moves.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
