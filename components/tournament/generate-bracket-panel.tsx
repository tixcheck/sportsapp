"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, TriangleAlert, Trophy } from "lucide-react";
import { toast } from "sonner";

import { generateBracketAction } from "@/server/actions/brackets";
import type { StandingsGroup } from "@/lib/standings/compute";
import {
  advancementCutoffTies,
  selectAdvancers,
  type AdvancementMode,
} from "@/lib/scheduler/tiebreakers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function GenerateBracketPanel({
  competitionId,
  pools,
  hasBracket,
  poolPlayComplete,
}: {
  competitionId: string;
  pools: StandingsGroup[];
  hasBracket: boolean;
  poolPlayComplete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AdvancementMode>("perPool");
  const [n, setN] = useState(2);
  const [order, setOrder] = useState<string[]>([]);

  const poolRows = pools.map((g) => g.rows);
  const nameById = new Map(
    pools.flatMap((g) => g.rows.map((r) => [r.teamId, r.teamName] as const)),
  );
  const totalTeams = poolRows.reduce((s, p) => s + p.length, 0);
  const maxPerPool = poolRows.reduce((m, p) => Math.max(m, p.length), 0);
  const nMax = mode === "perPool" ? Math.max(1, maxPerPool) : totalTeams;

  // Default seeding from the chosen mode/N; recomputed when those change. Manual
  // reordering (for coin-flip ties) edits `order` without resetting it.
  useEffect(() => {
    setOrder(selectAdvancers(poolRows, mode, Math.min(n, nMax)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, n, totalTeams]);

  const ties = advancementCutoffTies(poolRows, mode, Math.min(n, nMax));
  const tieNames = ties
    .flat()
    .map((id) => nameById.get(id) ?? "?")
    .join(", ");

  function move(i: number, dir: -1 | 1) {
    setOrder((prev) => {
      const list = [...prev];
      const j = i + dir;
      if (j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });
  }

  function generate() {
    if (order.length < 2) {
      toast.error("At least 2 teams must advance.");
      return;
    }
    startTransition(async () => {
      const res = await generateBracketAction(competitionId, order);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Bracket generated with ${order.length} teams.`);
      setOpen(false);
      router.refresh();
    });
  }

  if (totalTeams < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Draw pools and play matches before generating a bracket.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!poolPlayComplete && (
        <p className="text-ink-2 flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3.5" />
          Pool play isn&apos;t finished — seeds may change as remaining results
          come in.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Who advances</p>
          <div className="border-border flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("perPool")}
              className={
                mode === "perPool"
                  ? "bg-accent rounded px-2.5 py-1 font-medium"
                  : "text-muted-foreground rounded px-2.5 py-1"
              }
            >
              Top N per pool
            </button>
            <button
              type="button"
              onClick={() => setMode("overall")}
              className={
                mode === "overall"
                  ? "bg-accent rounded px-2.5 py-1 font-medium"
                  : "text-muted-foreground rounded px-2.5 py-1"
              }
            >
              Top N overall
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            {mode === "perPool" ? "Per pool" : "Overall"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() =>
                setN((v) => Math.max(mode === "overall" ? 2 : 1, v - 1))
              }
              aria-label="Fewer"
            >
              −
            </Button>
            <span className="w-6 text-center text-sm tabular-nums">
              {Math.min(n, nMax)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setN((v) => Math.min(nMax, v + 1))}
              aria-label="More"
            >
              +
            </Button>
          </div>
        </div>
      </div>

      {tieNames && (
        <p className="text-ink-2 flex items-start gap-1.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Tied at the cutoff: {tieNames}. Order is a fallback — drag with the
          arrows to enter a coin-flip result before generating.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Seed preview
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            {order.length} teams
          </span>
        </p>
        <ol className="divide-border border-border divide-y rounded-lg border">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-display text-claret w-5 text-right text-base font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 truncate font-medium">
                {nameById.get(id) ?? "—"}
              </span>
              <span className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {hasBracket ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Trophy />
              Regenerate bracket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate bracket?</DialogTitle>
              <DialogDescription>
                This discards the current bracket and all its matches, then
                reseeds from the order above.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={generate}
                disabled={pending}
              >
                {pending ? "Regenerating…" : "Discard & regenerate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Button onClick={generate} disabled={pending}>
          <Trophy />
          {pending ? "Generating…" : "Generate bracket"}
        </Button>
      )}
    </div>
  );
}
