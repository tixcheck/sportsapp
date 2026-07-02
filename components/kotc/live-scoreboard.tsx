"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Play } from "lucide-react";
import { toast } from "sonner";

import {
  appendKotcRallyAction,
  appendKotcServeErrorAction,
  endKotcRoundAction,
  startKotcRoundAction,
  undoKotcRallyAction,
} from "@/server/actions/kotc";
import {
  isRoundComplete,
  overallResults,
  reduceKotc,
  type KotcConfig,
  type KotcEvent,
} from "@/lib/kotc/engine";
import { rankKotcPool } from "@/lib/kotc/ranking";
import { replayHistory } from "@/lib/kotc/history";
import { buildScoreSheet } from "@/lib/kotc/scoresheet";
import { Button } from "@/components/ui/button";
import { ScoreSheet } from "@/components/kotc/score-sheet";

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
  players,
  config,
  roundMinutes,
  initialEvents,
  roundStarts,
  backHref,
}: {
  poolId: string;
  poolName: string;
  pairOrder: string[];
  names: Record<string, string>;
  players?: Record<string, string | null>;
  config: KotcConfig;
  roundMinutes: number;
  initialEvents: KotcEvent[];
  roundStarts: Record<number, string>;
  backHref: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<KotcEvent[]>(initialEvents);
  const [, startTransition] = useTransition();
  // Serialize background appends so the server log stays in tap order.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // Optimistic round-clock starts (before the server round_start round-trips).
  const [localStarts, setLocalStarts] = useState<Record<number, number>>({});
  // Rounds already auto-ended (cap or timer) — guards against double-firing.
  const autoEnded = useRef<Set<number>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  const state = reduceKotc(pairOrder, events, config);
  const standings = rankKotcPool(overallResults(state));
  const { rallies, byPair } = replayHistory(pairOrder, events, config);
  const recent = rallies
    .map((r, idx) => ({ r, idx }))
    .slice(-8)
    .reverse();
  const sheet = buildScoreSheet(pairOrder, events, config);
  const nameOf = (id: string) => names[id] ?? "—";
  const playersOf = (id: string) => players?.[id] ?? null;
  const done = state.status === "complete";

  // --- Round clock ----------------------------------------------------------
  const roundIdx = state.roundIndex;
  const startMs =
    roundStarts[roundIdx] != null
      ? new Date(roundStarts[roundIdx]).getTime()
      : (localStarts[roundIdx] ?? null);
  const endsAt = startMs != null ? startMs + roundMinutes * 60_000 : null;
  const remainingMs = endsAt != null ? Math.max(0, endsAt - nowMs) : null;

  // Tick the clock once a second while a round is running.
  useEffect(() => {
    if (endsAt == null || done) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt, done]);

  // Auto-end the round when its clock hits zero.
  useEffect(() => {
    if (
      remainingMs === 0 &&
      endsAt != null &&
      !done &&
      !autoEnded.current.has(roundIdx)
    ) {
      autoEnded.current.add(roundIdx);
      setEvents((prev) => [...prev, { type: "round_end" }]);
      startTransition(() => enqueue(() => endKotcRoundAction(poolId)));
      toast.message("Time! Round ended.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enqueue is per-render
  }, [remainingMs, endsAt, done, roundIdx, poolId]);

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
    let next: KotcEvent[] = [...events, { type: "rally", winnerSide }];
    startTransition(() =>
      enqueue(() => appendKotcRallyAction({ poolId, winnerSide })),
    );
    // Point cap: end the round automatically when a pair reaches the cap.
    const after = reduceKotc(pairOrder, next, config);
    if (
      config.pointCap != null &&
      after.status !== "complete" &&
      isRoundComplete(after, config) &&
      !autoEnded.current.has(roundIdx)
    ) {
      autoEnded.current.add(roundIdx);
      next = [...next, { type: "round_end" }];
      startTransition(() => enqueue(() => endKotcRoundAction(poolId)));
      toast.message(`Cap ${config.pointCap} reached — round ended.`);
    }
    setEvents(next);
  }

  function serveError() {
    if (done) return;
    // Challenger missed the serve: no point, King holds, challenger rotates out.
    setEvents((prev) => [...prev, { type: "serve_error" }]);
    startTransition(() => enqueue(() => appendKotcServeErrorAction(poolId)));
  }

  function startRound() {
    if (done || startMs != null) return;
    setLocalStarts((prev) => ({ ...prev, [roundIdx]: Date.now() }));
    startTransition(() => enqueue(() => startKotcRoundAction(poolId)));
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

      {/* Round clock */}
      {!done && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          {remainingMs != null ? (
            <span
              className={`font-display inline-flex items-center gap-2 text-2xl font-bold tabular-nums ${
                remainingMs <= 60_000 ? "text-destructive" : ""
              }`}
            >
              <Clock className="size-5" /> {formatClock(remainingMs)}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">
              Clock not started
            </span>
          )}
          {remainingMs == null ? (
            <Button size="sm" onClick={startRound}>
              <Play /> Start round ({roundMinutes}m)
            </Button>
          ) : (
            <span className="text-muted-foreground text-right text-xs">
              {config.pointCap != null
                ? `first to ${config.pointCap} or time`
                : "ends on time"}
            </span>
          )}
        </div>
      )}

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
              {playersOf(state.kingTeamId) && (
                <span className="text-xs opacity-80">
                  {playersOf(state.kingTeamId)}
                </span>
              )}
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
              {playersOf(state.challengerTeamId) && (
                <span className="text-muted-foreground text-xs">
                  {playersOf(state.challengerTeamId)}
                </span>
              )}
              <span className="text-muted-foreground text-sm tabular-nums">
                {state.totalPoints[state.challengerTeamId]} pts
              </span>
            </button>
          </div>

          {/* Challenger service error — King holds the court, no point scored. */}
          <button
            onClick={serveError}
            className="border-border bg-surface text-muted-foreground hover:text-foreground flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium active:scale-[0.99]"
          >
            Missed serve
            <span className="text-xs">· challenger out, no point</span>
          </button>

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

      {/* Recent points — who each point was scored against */}
      {recent.length > 0 && (
        <div className="border-border space-y-1 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Recent points</p>
          <ul className="space-y-0.5 text-sm">
            {recent.map(({ r, idx }) => (
              <li
                key={idx}
                className="flex items-baseline justify-between gap-2"
              >
                {r.scored ? (
                  <>
                    <span className="truncate">
                      <span className="font-medium">
                        {nameOf(r.kingTeamId)}
                      </span>{" "}
                      <span className="text-muted-foreground">scored vs</span>{" "}
                      {nameOf(r.challengerTeamId)}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      pt {r.pointNumber}
                    </span>
                  </>
                ) : r.serveError ? (
                  <span className="text-muted-foreground truncate">
                    <span className="text-foreground font-medium">
                      {nameOf(r.challengerTeamId)}
                    </span>{" "}
                    missed serve · no point
                  </span>
                ) : (
                  <span className="text-muted-foreground truncate">
                    <span className="text-foreground font-medium">
                      {nameOf(r.challengerTeamId)}
                    </span>{" "}
                    took the crown from {nameOf(r.kingTeamId)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live standings — points + longest-streak range at a glance */}
      <div className="border-border space-y-1 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Standings</p>
        <ol className="space-y-1">
          {standings.map((row) => {
            const h = byPair.get(row.teamId);
            return (
              <li
                key={row.teamId}
                className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-2 text-sm"
              >
                <span className="text-muted-foreground tabular-nums">
                  {row.position}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{nameOf(row.teamId)}</span>
                  {(playersOf(row.teamId) || h?.longestRange) && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {playersOf(row.teamId)}
                      {playersOf(row.teamId) && h?.longestRange && " · "}
                      {h?.longestRange && (
                        <span className="tabular-nums">
                          best {h.longestStreak} · pts {h.longestRange[0]}–
                          {h.longestRange[1]}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span
                  className="font-medium tabular-nums"
                  title={row.explanation}
                >
                  {row.kingPoints}
                  <span className="text-muted-foreground text-xs"> pts</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Paper-style score sheet (read-only) */}
      <ScoreSheet
        rounds={sheet}
        names={names}
        players={players}
        pairOrder={pairOrder}
        pointCap={config.pointCap}
      />
    </div>
  );
}

/** ms → "m:ss". */
function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
