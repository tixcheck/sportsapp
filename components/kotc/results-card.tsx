"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitKotcPoolResultsAction } from "@/server/actions/kotc";
import { rankKotcPool } from "@/lib/kotc/ranking";
import type { KotcPoolView } from "@/lib/queries/kotc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PairLabel } from "@/components/kotc/pair-label";

/** Per-pool manual results entry (King points + optional longest streak) with a
 * live standings table ranked by the pure 3-level KotC tiebreaker. */
export function ResultsCard({
  pool,
  scoreHref,
}: {
  pool: KotcPoolView;
  scoreHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const saved = new Map(pool.results.map((r) => [r.teamId, r]));
  const [rows, setRows] = useState(
    pool.pairs.map((p) => ({
      teamId: p.id,
      name: p.name,
      players: p.players ?? null,
      points: String(saved.get(p.id)?.kingPoints ?? ""),
      streak:
        saved.get(p.id)?.longestStreak == null
          ? ""
          : String(saved.get(p.id)!.longestStreak),
    })),
  );

  function set(teamId: string, field: "points" | "streak", value: string) {
    setRows((prev) =>
      prev.map((r) => (r.teamId === teamId ? { ...r, [field]: value } : r)),
    );
  }

  function save() {
    start(async () => {
      const res = await submitKotcPoolResultsAction({
        poolId: pool.id,
        results: rows.map((r) => ({
          teamId: r.teamId,
          kingPoints: Number(r.points) || 0,
          longestStreak: r.streak === "" ? null : Number(r.streak),
        })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${pool.name}: results saved.`);
      router.refresh();
    });
  }

  const nameOf = new Map(pool.pairs.map((p) => [p.id, p.name]));
  const playersOf = new Map(pool.pairs.map((p) => [p.id, p.players ?? null]));
  const standings = rankKotcPool(
    pool.results.map((r) => ({
      teamId: r.teamId,
      kingPoints: r.kingPoints,
      longestStreak: r.longestStreak,
      reachedSeq: r.reachedSeq,
    })),
  );

  return (
    <div className="border-border bg-surface space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold">{pool.name}</p>
        {scoreHref && (
          <Link
            href={scoreHref}
            className="text-primary text-xs font-medium hover:underline"
          >
            Score live →
          </Link>
        )}
      </div>

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
            <PairLabel name={r.name} players={r.players} className="text-sm" />
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
      </div>

      <Button size="sm" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save results"}
      </Button>

      {standings.length > 0 && (
        <div className="border-border space-y-1 border-t pt-2">
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
                <PairLabel
                  name={nameOf.get(row.teamId) ?? "—"}
                  players={playersOf.get(row.teamId)}
                />
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
      )}
    </div>
  );
}
