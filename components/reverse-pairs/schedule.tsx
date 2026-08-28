"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ReversePairsGameRow } from "@/lib/queries/reverse-pairs";
import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { setReversePairsScoreAction } from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The night, round by round.
 *
 * Scores are point totals rather than sets: standings are differential, so
 * 25-23 and 25-12 are very different results and both numbers have to be
 * recorded. Each row saves on its own — an organizer enters these one court at
 * a time as the games finish, not in a batch at the end.
 */
export function ReversePairsSchedule({
  games,
  byes,
  canEnterScores,
}: {
  games: ReversePairsGameRow[];
  byes: ReversePairsPair[][];
  canEnterScores: boolean;
}) {
  const rounds = [...new Set(games.map((g) => g.game))].sort((a, b) => a - b);

  if (games.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
          <CardDescription>
            Nothing drawn yet. Set the courts and rounds above, then draw the
            schedule.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule</CardTitle>
        <CardDescription>
          {rounds.length} rounds, {games.length} games. Three pairs a side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {rounds.map((n, i) => (
          <div key={n} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Round {n}</h3>
              {byes[i] && byes[i].length > 0 && (
                <p className="text-ink-3 truncate text-xs">
                  Sitting out: {byes[i].map((p) => p.name).join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              {games
                .filter((g) => g.game === n)
                .map((g) => (
                  <GameRow
                    key={g.id}
                    game={g}
                    canEnterScores={canEnterScores}
                  />
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function GameRow({
  game,
  canEnterScores,
}: {
  game: ReversePairsGameRow;
  canEnterScores: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState(game.scoreA?.toString() ?? "");
  const [b, setB] = useState(game.scoreB?.toString() ?? "");

  const dirty =
    a !== (game.scoreA?.toString() ?? "") ||
    b !== (game.scoreB?.toString() ?? "");

  function save(clear = false) {
    start(async () => {
      const res = await setReversePairsScoreAction({
        gameId: game.id,
        scoreA: clear ? null : a === "" ? null : Number(a),
        scoreB: clear ? null : b === "" ? null : Number(b),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (clear) {
        setA("");
        setB("");
      }
      toast.success(clear ? "Score cleared." : "Score saved.");
      router.refresh();
    });
  }

  const margin =
    game.scoreA !== null && game.scoreB !== null
      ? game.scoreA - game.scoreB
      : null;

  return (
    <div className="border-rule bg-surface grid gap-2 rounded-lg border p-3 sm:grid-cols-[3rem_1fr_auto_1fr]">
      <span className="text-ink-3 self-center text-xs font-medium">
        Court {game.court}
      </span>

      <Side
        pairs={game.sideA}
        won={margin !== null && margin > 0}
        align="left"
      />

      <div className="flex items-center justify-center gap-1.5 self-center">
        {canEnterScores ? (
          <>
            <Input
              type="number"
              min={0}
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="h-8 w-14 text-center tabular-nums"
              aria-label={`Score for ${game.sideA.map((p) => p.name).join(", ")}`}
            />
            <span className="text-ink-3 text-xs">–</span>
            <Input
              type="number"
              min={0}
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="h-8 w-14 text-center tabular-nums"
              aria-label={`Score for ${game.sideB.map((p) => p.name).join(", ")}`}
            />
            {dirty && (
              <Button size="sm" onClick={() => save()} disabled={pending}>
                Save
              </Button>
            )}
            {!dirty && game.scoreA !== null && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save(true)}
                disabled={pending}
                className="text-ink-3"
              >
                Clear
              </Button>
            )}
          </>
        ) : (
          <span className="text-sm font-semibold tabular-nums">
            {game.scoreA !== null ? `${game.scoreA} – ${game.scoreB}` : "—"}
          </span>
        )}
      </div>

      <Side
        pairs={game.sideB}
        won={margin !== null && margin < 0}
        align="right"
      />
    </div>
  );
}

function Side({
  pairs,
  won,
  align,
}: {
  pairs: ReversePairsPair[];
  won: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 self-center text-sm",
        align === "right" && "sm:justify-end",
        won && "font-semibold",
      )}
    >
      {pairs.map((p, i) => (
        <span key={p.id} className="truncate">
          {p.name}
          {i < pairs.length - 1 && <span className="text-ink-3"> ·</span>}
        </span>
      ))}
    </div>
  );
}
