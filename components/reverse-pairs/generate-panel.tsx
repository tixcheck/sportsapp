"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shuffle, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { generateReversePairsScheduleAction } from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Draw the night.
 *
 * The round count is the decision that matters and the one an organizer has no
 * way to reason about unaided: with more pairs than court space the byes only
 * divide evenly at certain counts, so 15 pairs on two courts works at 5 and 10
 * and nowhere in between. The suggestions are therefore the primary control,
 * not a hint underneath one — picking a number that leaves three pairs an extra
 * game is the mistake this panel exists to prevent.
 */
export function GenerateReversePairsPanel({
  competitionId,
  competitionName,
  pairCount,
  suggestions,
  initial,
  hasSchedule,
}: {
  competitionId: string;
  competitionName: string;
  pairCount: number;
  suggestions: { rounds: number; gamesPerPair: number }[];
  initial: { courts: number; rounds: number; minutesPerGame: number };
  hasSchedule: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [courts, setCourts] = useState(initial.courts);
  const [rounds, setRounds] = useState(initial.rounds);
  const [minutes, setMinutes] = useState(initial.minutesPerGame);
  const [confirmName, setConfirmName] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState<number | null>(null);

  const onCourt = courts * 6;
  const sittingOut = Math.max(0, pairCount - onCourt);
  const even = suggestions.find((s) => s.rounds === rounds);
  const slots = onCourt * rounds;

  function run(reseed: boolean) {
    start(async () => {
      const res = await generateReversePairsScheduleAction(
        {
          competitionId,
          courts,
          rounds,
          minutesPerGame: minutes,
          reseed,
        },
        { confirmName: confirmName || undefined },
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("needsConfirmation" in res) {
        setNeedsConfirm(res.played);
        toast.error(
          `${res.played} game${res.played === 1 ? " has" : "s have"} a score. Type the name to redraw anyway.`,
        );
        return;
      }
      setNeedsConfirm(null);
      setConfirmName("");
      toast.success(
        `Drawn — ${res.games} games, ${res.gamesPerPair} each${
          res.repeats === 0
            ? ", nobody teamed twice"
            : `, ${res.repeats} repeated pairing${res.repeats === 1 ? "" : "s"}`
        }.`,
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Draw the schedule</CardTitle>
        <CardDescription>
          {pairCount} pairs on {courts} court{courts === 1 ? "" : "s"} —{" "}
          {onCourt} play each round
          {sittingOut > 0 && `, ${sittingOut} sit out`}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rp-courts">Courts</Label>
            <Input
              id="rp-courts"
              type="number"
              min={1}
              max={12}
              value={courts}
              onChange={(e) => setCourts(Number(e.target.value) || 1)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rp-rounds">Rounds</Label>
            <Input
              id="rp-rounds"
              type="number"
              min={1}
              max={40}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value) || 1)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rp-minutes">Minutes per game</Label>
            <Input
              id="rp-minutes"
              type="number"
              min={5}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 15)}
            />
          </div>
        </div>

        {suggestions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Round counts where everyone plays the same number of games
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.rounds}
                  type="button"
                  onClick={() => setRounds(s.rounds)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    s.rounds === rounds
                      ? "border-claret bg-claret-tint text-claret font-medium"
                      : "border-rule bg-surface hover:bg-paper-sunken",
                  )}
                >
                  {s.rounds} rounds
                  <span className="text-ink-3 ml-1.5 text-xs">
                    {s.gamesPerPair} games each
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-ink-3 text-sm">
            No round count under 20 divides evenly for {pairCount} pairs on{" "}
            {courts} court{courts === 1 ? "" : "s"}. Someone will play an extra
            game.
          </p>
        )}

        {!even && (
          <p className="text-claret text-sm">
            {rounds} rounds is {slots} playing slots across {pairCount} pairs —
            that doesn&rsquo;t divide, so some pairs get an extra game. Pick a
            suggestion above to avoid it.
          </p>
        )}

        {needsConfirm !== null && (
          <div className="border-claret/40 bg-claret-tint/40 space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              Redrawing deletes {needsConfirm} recorded score
              {needsConfirm === 1 ? "" : "s"}. Type{" "}
              <b className="font-semibold">{competitionName}</b> to confirm.
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={competitionName}
              aria-label="Type the event name to confirm"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(false)} disabled={pending}>
            <Wand2 className="size-4" />
            {pending
              ? "Drawing…"
              : hasSchedule
                ? "Redraw with these settings"
                : "Draw the schedule"}
          </Button>
          {hasSchedule && (
            <Button
              variant="outline"
              onClick={() => run(true)}
              disabled={pending}
              title="Same settings, a different draw. Use this if the partner grid has repeats you'd rather not have."
            >
              <Shuffle className="size-4" />
              Try another draw
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
