"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  appendKotcRallyAction,
  endKotcRoundAction,
  undoKotcRallyAction,
} from "@/server/actions/kotc";
import {
  overallResults,
  reduceKotc,
  type KotcConfig,
  type KotcEvent,
} from "@/lib/kotc/engine";
import { rankKotcPool } from "@/lib/kotc/ranking";
import { Button } from "@/components/ui/button";

/**
 * Rally-by-rally live scoring for a KotC pool session. The pure engine runs
 * client-side for instant feedback; each tap is mirrored to the append-only
 * kotc_events log in the background (serialized so server order matches). The
 * server re-derives kotc_pool_results, so standings + the seed update live.
 */
export function LiveScoreboard({
  poolId,
  poolName,
  pairOrder,
  names,
  config,
  initialEvents,
  backHref,
}: {
  poolId: string;
  poolName: string;
  pairOrder: string[];
  names: Record<string, string>;
  config: KotcConfig;
  initialEvents: KotcEvent[];
  backHref: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<KotcEvent[]>(initialEvents);
  const [, startTransition] = useTransition();
  // Serialize background appends so the server log stays in tap order.
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const state = reduceKotc(pairOrder, events, config);
  const standings = rankKotcPool(overallResults(state));
  const nameOf = (id: string) => names[id] ?? "—";
  const done = state.status === "complete";

  function enqueue(run: () => Promise<{ error?: string } | unknown>) {
    chain.current = chain.current
      .then(() => run())
      .then((res) => {
        if (res && typeof res === "object" && "error" in res && res.error) {
          toast.error(String(res.error));
          router.refresh(); // resync from the authoritative server log
        }
      })
      .catch(() => {
        toast.error("Lost a tap — re-syncing.");
        router.refresh();
      });
  }

  function rally(winnerSide: "king" | "challenger") {
    if (done) return;
    setEvents((prev) => [...prev, { type: "rally", winnerSide }]);
    startTransition(() =>
      enqueue(() => appendKotcRallyAction({ poolId, winnerSide })),
    );
  }

  function undo() {
    if (!events.some((e) => e.type === "rally")) return;
    setEvents((prev) => [...prev, { type: "void" }]);
    startTransition(() => enqueue(() => undoKotcRallyAction(poolId)));
  }

  function endRound() {
    if (done) return;
    setEvents((prev) => [...prev, { type: "round_end" }]);
    startTransition(() => enqueue(() => endKotcRoundAction(poolId)));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Done
        </Link>
        <span className="text-muted-foreground text-sm tabular-nums">
          {poolName} · Round {state.roundIndex + 1}/{config.roundsPerSession}
        </span>
      </div>

      {done ? (
        <div className="border-border bg-surface rounded-xl border p-6 text-center">
          <p className="font-display text-lg font-semibold">Session complete</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Final standings are saved below.
          </p>
        </div>
      ) : (
        <>
          {/* King / challenger tap targets */}
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => rally("king")}
              className="bg-primary text-primary-foreground flex h-28 flex-col items-center justify-center rounded-xl text-center active:scale-[0.99]"
            >
              <span className="text-xs uppercase opacity-80">King won</span>
              <span className="font-display mt-1 text-2xl font-bold">
                {nameOf(state.kingTeamId)}
              </span>
              <span className="text-sm tabular-nums opacity-80">
                {state.totalPoints[state.kingTeamId]} pts · streak{" "}
                {state.roundStreak[state.kingTeamId]}
              </span>
            </button>
            <button
              onClick={() => rally("challenger")}
              className="border-border bg-surface flex h-28 flex-col items-center justify-center rounded-xl border text-center active:scale-[0.99]"
            >
              <span className="text-muted-foreground text-xs uppercase">
                Challenger won
              </span>
              <span className="font-display mt-1 text-2xl font-bold">
                {nameOf(state.challengerTeamId)}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {state.totalPoints[state.challengerTeamId]} pts
              </span>
            </button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={undo}
              className="flex-1"
            >
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={endRound}
              className="flex-1"
            >
              End round
            </Button>
          </div>

          {/* On-deck queue */}
          {state.queue.length > 0 && (
            <div className="text-muted-foreground text-xs">
              On deck: {state.queue.map(nameOf).join(" → ")}
            </div>
          )}
        </>
      )}

      {/* Live standings */}
      <div className="border-border space-y-1 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Standings</p>
        <ol className="space-y-0.5">
          {standings.map((row) => (
            <li
              key={row.teamId}
              className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 text-sm"
            >
              <span className="text-muted-foreground tabular-nums">
                {row.position}
              </span>
              <span className="truncate">{nameOf(row.teamId)}</span>
              <span
                className="text-muted-foreground tabular-nums"
                title={row.explanation}
              >
                {row.kingPoints} pts
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
