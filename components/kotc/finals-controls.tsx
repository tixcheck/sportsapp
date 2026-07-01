"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { toast } from "sonner";

import {
  composeFinalsAction,
  runConsolationAction,
} from "@/server/actions/kotc";
import type { KotcPairView } from "@/lib/queries/kotc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The single consolation round: enter King points for every pair eliminated in
 * the pools, then crown one winner (the last finals berth). Always 15 minutes,
 * independent of the configured round length — hence the fixed label.
 */
export function ConsolationCard({
  competitionId,
  eliminated,
}: {
  competitionId: string;
  eliminated: KotcPairView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(
    eliminated.map((p) => ({
      teamId: p.id,
      name: p.name,
      players: p.players ?? null,
      points: "",
      streak: "",
    })),
  );

  function set(teamId: string, field: "points" | "streak", value: string) {
    setRows((prev) =>
      prev.map((r) => (r.teamId === teamId ? { ...r, [field]: value } : r)),
    );
  }

  function run() {
    start(async () => {
      const res = await runConsolationAction({
        competitionId,
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
      const winner =
        rows.find((r) => r.teamId === res.winner)?.name ?? "A pair";
      toast.success(`${winner} wins consolation → into the finals.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        One round, fixed 15 minutes. The winner takes the last finals spot.
      </p>
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
            {r.name}
            {r.players && (
              <span className="text-muted-foreground"> · {r.players}</span>
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
      <Button size="sm" disabled={pending} onClick={run}>
        {pending ? "Scoring…" : "Run consolation (15 min)"}
      </Button>
    </div>
  );
}

/** Assemble the finals roster (pool survivors + consolation winner) into a pool. */
export function ComposeFinalsButton({
  competitionId,
}: {
  competitionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await composeFinalsAction({ competitionId });
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          toast.success(
            res.done
              ? `Finals set — ${res.roster.length} pairs are the podium.`
              : `Finals set — ${res.roster.length} pairs, play the drop loop.`,
          );
          router.refresh();
        })
      }
    >
      <Trophy /> {pending ? "Assembling…" : "Assemble the finals"}
    </Button>
  );
}
