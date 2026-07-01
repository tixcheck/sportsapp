"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { advanceEliminationRoundAction } from "@/server/actions/kotc";
import { rankKotcPool } from "@/lib/kotc/ranking";
import type { KotcPoolView } from "@/lib/queries/kotc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * One elimination (or finals) pool, played as an iterative drop loop: enter the
 * round's King points, drop the lowest-ranked pair, repeat until 3 remain. A true
 * tie for last (manual entry) is surfaced as a picker instead of being auto-dropped.
 * When 3 remain they advance (elimination) or are the podium (finals).
 */
export function EliminationPool({
  pool,
  kind,
}: {
  pool: KotcPoolView;
  kind: "elimination" | "finals";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const nameOf = new Map(pool.pairs.map((p) => [p.id, p.name]));
  const playersOf = new Map(pool.pairs.map((p) => [p.id, p.players ?? null]));
  const remaining = pool.pairs.filter((p) => p.eliminatedAtRound === null);
  const done = remaining.length <= 3;

  // Per-remaining-pair entry for the next drop round.
  const [rows, setRows] = useState(
    remaining.map((p) => ({ teamId: p.id, points: "", streak: "" })),
  );
  // When a drop can't be auto-resolved (genuine tie), the organizer must choose.
  const [tie, setTie] = useState<string[] | null>(null);
  const [dropChoice, setDropChoice] = useState<string>("");

  function set(teamId: string, field: "points" | "streak", value: string) {
    setRows((prev) =>
      prev.map((r) => (r.teamId === teamId ? { ...r, [field]: value } : r)),
    );
  }

  function play(dropTeamId?: string) {
    start(async () => {
      const res = await advanceEliminationRoundAction({
        poolId: pool.id,
        results: rows.map((r) => ({
          teamId: r.teamId,
          kingPoints: Number(r.points) || 0,
          longestStreak: r.streak === "" ? null : Number(r.streak),
        })),
        dropTeamId,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("tie" in res) {
        setTie(res.tiedTeamIds);
        setDropChoice(res.tiedTeamIds[0] ?? "");
        return;
      }
      setTie(null);
      toast.success(
        res.done
          ? `Down to the final 3 — dropped ${nameOf.get(res.dropped) ?? "a pair"}.`
          : `Dropped ${nameOf.get(res.dropped) ?? "a pair"} · ${res.remaining} left.`,
      );
      router.refresh();
    });
  }

  // The pairs dropped in each completed round (for the drop history).
  const droppedByRound = new Map<number, string>();
  for (const p of pool.pairs) {
    if (p.eliminatedAtRound !== null)
      droppedByRound.set(p.eliminatedAtRound, p.id);
  }

  // Podium / advancement order: rank the final round's results, keep survivors.
  const lastRound = pool.rounds.at(-1);
  const survivorIds = new Set(remaining.map((p) => p.id));
  const podium = lastRound
    ? rankKotcPool(
        lastRound.results.map((r) => ({
          teamId: r.teamId,
          kingPoints: r.kingPoints,
          longestStreak: r.longestStreak,
          reachedSeq: r.reachedSeq,
        })),
      ).filter((row) => survivorIds.has(row.teamId))
    : [];

  return (
    <div className="border-border bg-surface space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold">{pool.name}</p>
        <span className="text-muted-foreground text-xs tabular-nums">
          {done ? "complete" : `${remaining.length} left`}
        </span>
      </div>

      {pool.rounds.length > 0 && (
        <ol className="text-muted-foreground space-y-0.5 text-xs">
          {pool.rounds.map((r) => (
            <li key={r.roundIndex}>
              Round {r.roundIndex + 1}: dropped{" "}
              <span className="text-foreground">
                {nameOf.get(droppedByRound.get(r.roundIndex) ?? "") ?? "—"}
              </span>
            </li>
          ))}
        </ol>
      )}

      {done ? (
        <div className="border-border space-y-1 border-t pt-2">
          <p className="text-muted-foreground text-xs">
            {kind === "finals" ? "Podium" : "Advancing"}
          </p>
          <ol className="space-y-0.5">
            {(podium.length > 0
              ? podium.map((row) => ({ teamId: row.teamId }))
              : remaining.map((p) => ({ teamId: p.id }))
            ).map((row, i) => (
              <li
                key={row.teamId}
                className="grid grid-cols-[1.5rem_1fr] items-center gap-2 text-sm"
              >
                <span className="text-muted-foreground tabular-nums">
                  {kind === "finals" ? medal(i) : i + 1}
                </span>
                <span className="truncate">
                  {nameOf.get(row.teamId)}
                  {playersOf.get(row.teamId) && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {playersOf.get(row.teamId)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : tie ? (
        <div className="border-border space-y-2 border-t pt-2">
          <p className="text-sm">Tie for last — pick the pair to eliminate:</p>
          <div className="flex flex-col gap-1">
            {tie.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`drop-${pool.id}`}
                  checked={dropChoice === id}
                  onChange={() => setDropChoice(id)}
                />
                {nameOf.get(id)}
                {playersOf.get(id) && (
                  <span className="text-muted-foreground">
                    · {playersOf.get(id)}
                  </span>
                )}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !dropChoice}
              onClick={() => play(dropChoice)}
            >
              {pending ? "Dropping…" : "Eliminate this pair"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setTie(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-muted-foreground grid grid-cols-[1fr_4rem_4rem] gap-2 text-xs">
            <span>Pair</span>
            <span className="text-right">King pts</span>
            <span className="text-right">Streak</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.teamId}
              className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2"
            >
              <span className="truncate text-sm">
                {nameOf.get(r.teamId)}
                {playersOf.get(r.teamId) && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {playersOf.get(r.teamId)}
                  </span>
                )}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                value={r.points}
                onChange={(e) => set(r.teamId, "points", e.target.value)}
                className="h-9 text-right tabular-nums"
              />
              <Input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={r.streak}
                onChange={(e) => set(r.teamId, "streak", e.target.value)}
                className="h-9 text-right tabular-nums"
              />
            </div>
          ))}
          <Button size="sm" disabled={pending} onClick={() => play()}>
            {pending ? "Scoring…" : "Play round → drop lowest"}
          </Button>
        </div>
      )}
    </div>
  );
}

function medal(i: number): string {
  return ["🥇", "🥈", "🥉"][i] ?? String(i + 1);
}
