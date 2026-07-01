"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Shuffle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { assignKotcPoolsAction } from "@/server/actions/kotc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Pair = { id: string; name: string; players?: string | null };
type Pool = { name: string; teamIds: string[] };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Assign pairs into a stage's pools. Used manually for Round 1 and pre-filled
 * with a re-pool / elimination proposal (the organizer tweaks, then commits).
 */
export function PoolBuilder({
  stageId,
  roster,
  initialPools,
  note,
}: {
  stageId: string;
  roster: Pair[];
  initialPools?: Pool[];
  note?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const nameOf = useMemo(
    () => new Map(roster.map((p) => [p.id, p.name])),
    [roster],
  );
  const playersOf = useMemo(
    () => new Map(roster.map((p) => [p.id, p.players ?? null])),
    [roster],
  );

  const [pools, setPools] = useState<Pool[]>(
    initialPools && initialPools.length > 0
      ? initialPools
      : [{ name: "Pool A", teamIds: [] }],
  );
  const [count, setCount] = useState(initialPools?.length ?? 2);
  const [selected, setSelected] = useState<string | null>(null);

  const assigned = new Set(pools.flatMap((p) => p.teamIds));
  const unassigned = roster.filter((p) => !assigned.has(p.id));

  function autoSplit() {
    const n = Math.max(1, Math.min(count, roster.length));
    const next: Pool[] = Array.from({ length: n }, (_, i) => ({
      name: `Pool ${LETTERS[i]}`,
      teamIds: [] as string[],
    }));
    roster.forEach((p, i) => next[i % n].teamIds.push(p.id)); // round-robin
    setPools(next);
    setSelected(null);
  }

  function moveTo(target: number | "unassigned") {
    if (!selected) return;
    setPools((prev) => {
      const next = prev.map((p) => ({
        ...p,
        teamIds: p.teamIds.filter((id) => id !== selected),
      }));
      if (target !== "unassigned") next[target].teamIds.push(selected);
      return next;
    });
    setSelected(null);
  }

  function addPool() {
    setPools((p) => [...p, { name: `Pool ${LETTERS[p.length]}`, teamIds: [] }]);
  }
  function removePool(i: number) {
    setPools((p) => p.filter((_, j) => j !== i));
    setSelected(null);
  }

  const issue =
    unassigned.length > 0
      ? `${unassigned.length} pair${unassigned.length > 1 ? "s" : ""} unassigned`
      : pools.some((p) => p.teamIds.length < 2)
        ? "Every pool needs at least 2 pairs"
        : null;

  function commit() {
    if (issue) {
      toast.error(issue);
      return;
    }
    start(async () => {
      const res = await assignKotcPoolsAction({ stageId, pools });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Assigned ${res.pairCount} pairs into ${res.poolCount} pools.`,
      );
      router.refresh();
    });
  }

  const chip = (id: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setSelected(selected === id ? null : id)}
      className={cn(
        "min-h-11 rounded-md border px-2 text-left text-xs transition-colors sm:min-h-9",
        selected === id
          ? "border-primary bg-accent ring-primary ring-2"
          : "border-border bg-surface hover:bg-muted",
      )}
    >
      {nameOf.get(id) ?? "—"}
      {playersOf.get(id) && (
        <span className="text-muted-foreground"> · {playersOf.get(id)}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-3">
      {note && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Shuffle className="size-3.5" /> {note}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label className="text-xs font-medium">Pools</label>
          <Input
            type="number"
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
            className="w-20 tabular-nums"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={autoSplit}>
          <Shuffle /> Auto-split evenly
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={addPool}>
          <Plus /> Add pool
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        {selected
          ? `Moving ${nameOf.get(selected)} — tap a pool or the unassigned bin.`
          : "Tap a pair, then tap a pool to move it."}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pools.map((pool, i) => (
          <div
            key={i}
            onClick={() => selected && moveTo(i)}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              selected
                ? "border-primary/60 bg-accent/40 cursor-pointer"
                : "border-border bg-surface",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold">
                {pool.name}
                <span className="text-muted-foreground ml-1 text-xs font-normal tabular-nums">
                  ({pool.teamIds.length})
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={pools.length <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  removePool(i);
                }}
                aria-label="Remove pool"
              >
                <Minus />
              </Button>
            </div>
            <div className="mt-2 grid gap-1">
              {pool.teamIds.length === 0 ? (
                <p className="text-muted-foreground py-2 text-center text-xs">
                  Empty — drop a pair here
                </p>
              ) : (
                pool.teamIds.map((id) => chip(id))
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        onClick={() => selected && moveTo("unassigned")}
        className={cn(
          "rounded-lg border border-dashed p-3 transition-colors",
          selected
            ? "border-primary/60 bg-accent/40 cursor-pointer"
            : "border-border",
          unassigned.length > 0 && "border-destructive/50",
        )}
      >
        <p className="text-xs font-medium">
          Unassigned
          <span className="text-muted-foreground ml-1 font-normal tabular-nums">
            ({unassigned.length})
          </span>
        </p>
        {unassigned.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {unassigned.map((p) => chip(p.id))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        {issue ? (
          <span className="text-destructive flex items-center gap-1.5 text-xs">
            <TriangleAlert className="size-3.5" /> {issue}
          </span>
        ) : (
          <span />
        )}
        <Button onClick={commit} disabled={pending || !!issue}>
          {pending ? "Saving…" : "Save pools"}
        </Button>
      </div>
    </div>
  );
}
