"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";

import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { swapReversePairsAction } from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SELECT =
  "border-input bg-surface h-9 w-full rounded-md border px-3 text-sm";

/**
 * Put a pair who is sitting out into a late pair's place, before the night
 * starts.
 *
 * The two pairs exchange their WHOLE schedules, both ways. That does not
 * disturb the draw, which is the first thing an organizer asks: a Reverse Pairs
 * night is balanced by POSITION — whoever holds a given slot plays six games,
 * sits out once, and meets a set spread of partners — so swapping who stands in
 * two slots is a relabelling, not a redraw. Both pairs still play six.
 *
 * Reversible: swapping the same two back restores the draw exactly, which is
 * why this asks for no confirmation.
 */
export function ReversePairsSwapCard({
  competitionId,
  pairs,
  sittingOutFirst,
  locked,
}: {
  competitionId: string;
  pairs: ReversePairsPair[];
  /** Who sits out the first round — the pairs a late arrival swaps with. */
  sittingOutFirst: ReversePairsPair[];
  /** Scores are in, so the draw is fixed. */
  locked: boolean;
}) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const nameOf = (id: string) => pairs.find((p) => p.id === id)?.name ?? "";

  function swap() {
    setMessage(null);
    setFailed(false);
    start(async () => {
      const a = nameOf(teamA);
      const b = nameOf(teamB);
      const res = await swapReversePairsAction({ competitionId, teamA, teamB });
      if ("error" in res) {
        setFailed(true);
        setMessage(res.error);
        return;
      }
      setMessage(
        `${a} and ${b} have swapped places — ${res.games} game${res.games === 1 ? "" : "s"} moved. Both still play the same number.`,
      );
      setTeamA("");
      setTeamB("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="size-4" />
          Swap two pairs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          If a pair is running late, swap them with a pair who is sitting out so
          the night can start on time. The two exchange their whole schedules,
          both ways — everyone still plays the same number of games, so the draw
          stays fair.
        </p>

        {sittingOutFirst.length > 0 && (
          <p className="text-ink-2 text-sm">
            Sitting out the first round:{" "}
            <span className="font-medium">
              {sittingOutFirst.map((p) => p.name).join(" · ")}
            </span>
          </p>
        )}

        {locked ? (
          <p className="border-rule bg-paper-sunken text-ink-2 rounded-md border p-3 text-sm">
            Scores have been entered, so the draw is fixed. Swapping now would
            give one pair the other pair&rsquo;s results.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="rp-swap-a">This pair</Label>
                <select
                  id="rp-swap-a"
                  className={SELECT}
                  value={teamA}
                  onChange={(e) => setTeamA(e.target.value)}
                >
                  <option value="">Choose a pair…</option>
                  {pairs.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === teamB}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-ink-3 hidden pb-2 text-center text-sm sm:block">
                swaps with
              </span>

              <div className="space-y-1.5">
                <Label htmlFor="rp-swap-b">That pair</Label>
                <select
                  id="rp-swap-b"
                  className={SELECT}
                  value={teamB}
                  onChange={(e) => setTeamB(e.target.value)}
                >
                  <option value="">Choose a pair…</option>
                  {pairs.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id === teamA}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={swap}
              disabled={pending || !teamA || !teamB || teamA === teamB}
            >
              {pending ? "Swapping…" : "Swap places"}
            </Button>
          </>
        )}

        {message && (
          <p
            className={
              failed ? "text-sm text-rose-700" : "text-sm text-emerald-700"
            }
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
