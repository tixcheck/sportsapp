"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { generatePoolsAction } from "@/server/actions/pools";
import {
  poolName,
  poolPlan,
  SHORT_POOL_FORMAT,
  snakeDraftIntoSizes,
  suggestPoolStructure,
  validatePoolStructure,
} from "@/lib/scheduler/pools";
import { cn } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Team = { id: string; name: string; seed: number | null };
type DivisionTeams = { id: string; name: string; teams: Team[] };

/** Sort by seed (seeded first), falling back to the given registration order. */
function seedOrder(teams: Team[]): Team[] {
  return teams
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.seed ?? 1e9) - (b.t.seed ?? 1e9) || a.i - b.i)
    .map((x) => x.t);
}

function shortDefaults(sizes: number[]): boolean[] {
  return sizes.map((s) => poolPlan(s).suggestedFormat !== null);
}

export function GeneratePoolsPanel({
  competitionId,
  divisions,
  hasPools,
}: {
  competitionId: string;
  divisions: DivisionTeams[];
  hasPools: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startTime, setStartTime] = useState("09:00");
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Record<string, Team[]>>(() =>
    Object.fromEntries(divisions.map((d) => [d.id, seedOrder(d.teams)])),
  );
  const [sizes, setSizes] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      divisions.map((d) => [d.id, suggestPoolStructure(d.teams.length)]),
    ),
  );
  const [short, setShort] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(
      divisions.map((d) => [
        d.id,
        shortDefaults(suggestPoolStructure(d.teams.length)),
      ]),
    ),
  );

  // Re-sync when the team set changes on the server (team added/removed, or
  // pools generated). A changed team count invalidates the chosen structure, so
  // we reset it to the suggested default for the new count — making the common
  // post-removal case a one-click accept-and-regenerate. Local reordering never
  // triggers this (`divisions` only gets a new ref on a server re-render).
  useEffect(() => {
    setOrders((prev) => {
      const next: Record<string, Team[]> = {};
      for (const d of divisions) {
        const incoming = seedOrder(d.teams);
        const byId = new Map(incoming.map((t) => [t.id, t]));
        const kept = (prev[d.id] ?? [])
          .filter((t) => byId.has(t.id))
          .map((t) => byId.get(t.id)!);
        const keptIds = new Set(kept.map((t) => t.id));
        next[d.id] = [...kept, ...incoming.filter((t) => !keptIds.has(t.id))];
      }
      return next;
    });
    const suggested = Object.fromEntries(
      divisions.map((d) => [d.id, suggestPoolStructure(d.teams.length)]),
    );
    setSizes(suggested);
    setShort(
      Object.fromEntries(
        Object.entries(suggested).map(([id, s]) => [id, shortDefaults(s)]),
      ),
    );
  }, [divisions]);

  const totalTeams = divisions.reduce((n, d) => n + d.teams.length, 0);

  function move(divId: string, index: number, dir: -1 | 1) {
    setOrders((prev) => {
      const list = [...prev[divId]];
      const j = index + dir;
      if (j < 0 || j >= list.length) return prev;
      [list[index], list[j]] = [list[j], list[index]];
      return { ...prev, [divId]: list };
    });
  }

  function autoSeed(divId: string) {
    const d = divisions.find((x) => x.id === divId);
    if (d) setOrders((prev) => ({ ...prev, [divId]: [...d.teams] }));
  }

  function setSize(divId: string, i: number, delta: number) {
    setSizes((prev) => {
      const list = [...prev[divId]];
      list[i] = Math.max(1, list[i] + delta);
      return { ...prev, [divId]: list };
    });
  }

  function addPool(divId: string) {
    setSizes((prev) => ({ ...prev, [divId]: [...prev[divId], 1] }));
    setShort((prev) => ({ ...prev, [divId]: [...prev[divId], false] }));
  }

  function removePool(divId: string, i: number) {
    setSizes((prev) => ({
      ...prev,
      [divId]: prev[divId].filter((_, j) => j !== i),
    }));
    setShort((prev) => ({
      ...prev,
      [divId]: prev[divId].filter((_, j) => j !== i),
    }));
  }

  function toggleShort(divId: string, i: number) {
    setShort((prev) => {
      const list = [...prev[divId]];
      list[i] = !list[i];
      return { ...prev, [divId]: list };
    });
  }

  function resetStructure(divId: string) {
    const d = divisions.find((x) => x.id === divId);
    if (!d) return;
    const s = suggestPoolStructure(d.teams.length);
    setSizes((prev) => ({ ...prev, [divId]: s }));
    setShort((prev) => ({ ...prev, [divId]: shortDefaults(s) }));
  }

  function generate() {
    // Validate every non-empty division's structure first.
    for (const d of divisions) {
      if (d.teams.length === 0) continue;
      const v = validatePoolStructure(sizes[d.id] ?? [], d.teams.length);
      if (!v.ok) {
        toast.error(`${d.name}: ${v.errors[0]}`);
        return;
      }
    }

    const orderByDivision: Record<string, string[]> = {};
    const structureByDivision: Record<
      string,
      { teamIds: string[]; matchFormat: typeof SHORT_POOL_FORMAT | null }[]
    > = {};
    for (const d of divisions) {
      if (d.teams.length === 0) continue;
      const orderIds = (orders[d.id] ?? []).map((t) => t.id);
      orderByDivision[d.id] = orderIds;
      const drafted = snakeDraftIntoSizes(orderIds, sizes[d.id] ?? []);
      structureByDivision[d.id] = drafted.map((teamIds, i) => ({
        teamIds,
        matchFormat: short[d.id]?.[i] ? SHORT_POOL_FORMAT : null,
      }));
    }

    startTransition(async () => {
      const result = await generatePoolsAction(competitionId, startTime, {
        orderByDivision,
        structureByDivision,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Generated ${result.poolCount} pools and ${result.matchCount} matches.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  if (totalTeams < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Add at least 2 teams before drawing pools.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {divisions.map((d) => {
        const list = orders[d.id] ?? [];
        if (list.length === 0) return null;
        const nameById = new Map(list.map((t) => [t.id, t.name]));
        const divSizes = sizes[d.id] ?? [];
        const sum = divSizes.reduce((a, b) => a + b, 0);
        const v = validatePoolStructure(divSizes, d.teams.length);
        const preview = snakeDraftIntoSizes(
          list.map((t) => t.id),
          divSizes,
        );

        return (
          <div key={d.id} className="space-y-4">
            {divisions.length > 1 && (
              <h4 className="font-display font-semibold">{d.name}</h4>
            )}

            {/* Seed order */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Seed order</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => autoSeed(d.id)}
                >
                  <Shuffle />
                  Auto-seed by registration
                </Button>
              </div>
              <ol className="divide-border border-border divide-y rounded-lg border">
                {list.map((t, i) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground w-5 text-right tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-medium">
                      {t.name}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={i === 0}
                        onClick={() => move(d.id, i, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={i === list.length - 1}
                        onClick={() => move(d.id, i, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown />
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Pool structure */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Pool structure
                  <span
                    className={cn(
                      "ml-2 text-xs font-normal tabular-nums",
                      sum === d.teams.length
                        ? "text-muted-foreground"
                        : "text-destructive",
                    )}
                  >
                    {sum} of {d.teams.length} teams
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => resetStructure(d.id)}
                >
                  <RotateCcw />
                  Reset to suggested
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {divSizes.map((size, i) => {
                  const plan = poolPlan(size);
                  return (
                    <div
                      key={i}
                      className="border-border bg-surface rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-semibold">
                          Pool {poolName(i)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removePool(d.id, i)}
                          aria-label="Remove pool"
                          disabled={divSizes.length <= 1}
                        >
                          <Minus />
                        </Button>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setSize(d.id, i, -1)}
                          aria-label="Fewer teams"
                        >
                          <Minus />
                        </Button>
                        <span className="w-6 text-center text-sm tabular-nums">
                          {size}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setSize(d.id, i, 1)}
                          aria-label="More teams"
                        >
                          <Plus />
                        </Button>
                        <span className="text-muted-foreground text-xs">
                          {plan.roundsPerTeam === 2
                            ? "double RR"
                            : "round-robin"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleShort(d.id, i)}
                        className={cn(
                          "mt-2 w-full rounded-md border px-2 py-1 text-xs transition-colors",
                          short[d.id]?.[i]
                            ? "border-primary bg-accent"
                            : "border-border bg-surface hover:bg-muted",
                        )}
                      >
                        {short[d.id]?.[i]
                          ? "Format: sets to 15 / tiebreak 11"
                          : "Format: competition standard"}
                      </button>

                      <ol className="mt-2 space-y-0.5">
                        {(preview[i] ?? []).map((id) => (
                          <li key={id} className="truncate text-xs">
                            {nameById.get(id) ?? "—"}
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => addPool(d.id)}
                  className="border-border text-muted-foreground hover:bg-muted flex min-h-20 items-center justify-center gap-1 rounded-lg border border-dashed text-sm"
                >
                  <Plus className="size-4" />
                  Add pool
                </button>
              </div>

              {v.warnings.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <TriangleAlert className="size-3.5" />
                  {v.warnings[0]}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="startTime">First match time</Label>
          <Input
            id="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-36"
          />
        </div>

        {hasPools ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Sparkles />
                Regenerate pools
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Regenerate pools?</DialogTitle>
                <DialogDescription>
                  This discards the current pool assignments and the entire pool
                  schedule, then draws fresh pools from the seed order and
                  structure above.
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
            <Sparkles />
            {pending ? "Generating…" : "Generate pools"}
          </Button>
        )}
      </div>
    </div>
  );
}
