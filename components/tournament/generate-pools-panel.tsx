"use client";

import { useEffect, useState, useTransition, type DragEvent } from "react";
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
  poolSizesForGames,
  snakeDraftIntoSizes,
  validatePoolStructure,
} from "@/lib/scheduler/pools";
import {
  addPlacementPool,
  movePlacement,
  placementFromPools,
  removePlacementPool,
  type MoveDest,
  type Placement,
} from "@/lib/scheduler/placement";
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
type Mode = "auto" | "manual";

/** Sort by seed (seeded first), falling back to the given registration order. */
function seedOrder(teams: Team[]): Team[] {
  return teams
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.seed ?? 1e9) - (b.t.seed ?? 1e9) || a.i - b.i)
    .map((x) => x.t);
}

/** Shorter games are off by default — the organizer opts a pool in explicitly. */
function shortDefaults(sizes: number[]): boolean[] {
  return sizes.map(() => false);
}

export function GeneratePoolsPanel({
  competitionId,
  divisions,
  hasPools,
  defaultStartTime = "09:00",
  gamesPerTeam = 3,
}: {
  competitionId: string;
  divisions: DivisionTeams[];
  hasPools: boolean;
  /** The tournament's start time — the default first-match time. */
  defaultStartTime?: string;
  /** Target pool games per team — sizes the suggested pool structure. */
  gamesPerTeam?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Record<string, Team[]>>(() =>
    Object.fromEntries(divisions.map((d) => [d.id, seedOrder(d.teams)])),
  );
  const [sizes, setSizes] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      divisions.map((d) => [
        d.id,
        poolSizesForGames(d.teams.length, gamesPerTeam),
      ]),
    ),
  );
  const [short, setShort] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(
      divisions.map((d) => [
        d.id,
        shortDefaults(poolSizesForGames(d.teams.length, gamesPerTeam)),
      ]),
    ),
  );
  const [mode, setMode] = useState<Record<string, Mode>>(() =>
    Object.fromEntries(divisions.map((d) => [d.id, "auto"])),
  );
  // Manual mode: live placement + per-pool format override (null = follow the
  // size-based suggestion). `selected` drives tap-to-move.
  const [placement, setPlacement] = useState<Record<string, Placement>>({});
  const [override, setOverride] = useState<Record<string, (boolean | null)[]>>(
    {},
  );
  const [selected, setSelected] = useState<{
    divId: string;
    teamId: string;
  } | null>(null);

  // Re-sync when the team set changes on the server (team added/removed, or
  // pools generated). A changed count invalidates any chosen structure, so we
  // reset to the suggested default for the new count and drop back to auto mode
  // — making the post-removal case a one-click accept-and-regenerate.
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
      divisions.map((d) => [
        d.id,
        poolSizesForGames(d.teams.length, gamesPerTeam),
      ]),
    );
    setSizes(suggested);
    setShort(
      Object.fromEntries(
        Object.entries(suggested).map(([id, s]) => [id, shortDefaults(s)]),
      ),
    );
    setMode(Object.fromEntries(divisions.map((d) => [d.id, "auto"])));
    setPlacement({});
    setOverride({});
    setSelected(null);
  }, [divisions, gamesPerTeam]);

  const totalTeams = divisions.reduce((n, d) => n + d.teams.length, 0);

  // --- auto-mode editing ---
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
    const s = poolSizesForGames(d.teams.length, gamesPerTeam);
    setSizes((prev) => ({ ...prev, [divId]: s }));
    setShort((prev) => ({ ...prev, [divId]: shortDefaults(s) }));
  }

  // --- mode switching ---
  function enterManual(divId: string) {
    const orderIds = (orders[divId] ?? []).map((t) => t.id);
    const drafted = snakeDraftIntoSizes(orderIds, sizes[divId] ?? []);
    setPlacement((prev) => ({ ...prev, [divId]: placementFromPools(drafted) }));
    setOverride((prev) => ({ ...prev, [divId]: drafted.map(() => null) }));
    setMode((prev) => ({ ...prev, [divId]: "manual" }));
    setSelected(null);
  }
  function exitManual(divId: string) {
    setMode((prev) => ({ ...prev, [divId]: "auto" }));
    setSelected(null);
  }

  // --- manual placement editing ---
  function applyMove(divId: string, teamId: string, dest: MoveDest) {
    setPlacement((prev) => ({
      ...prev,
      [divId]: movePlacement(prev[divId], teamId, dest),
    }));
    setSelected(null);
  }
  function tapTarget(divId: string, dest: MoveDest) {
    if (selected && selected.divId === divId)
      applyMove(divId, selected.teamId, dest);
  }
  function addManualPool(divId: string) {
    setPlacement((prev) => ({
      ...prev,
      [divId]: addPlacementPool(prev[divId]),
    }));
    setOverride((prev) => ({
      ...prev,
      [divId]: [...(prev[divId] ?? []), null],
    }));
  }
  function removeManualPool(divId: string, i: number) {
    setPlacement((prev) => ({
      ...prev,
      [divId]: removePlacementPool(prev[divId], i),
    }));
    setOverride((prev) => ({
      ...prev,
      [divId]: (prev[divId] ?? []).filter((_, j) => j !== i),
    }));
    setSelected(null);
  }
  function effShort(divId: string, i: number): boolean {
    return override[divId]?.[i] ?? false;
  }
  function toggleManualShort(divId: string, i: number) {
    setOverride((prev) => {
      const list = [...(prev[divId] ?? [])];
      list[i] = !effShort(divId, i);
      return { ...prev, [divId]: list };
    });
  }

  /** A blocking reason for a division (null = ready), shown to the organizer. */
  function divisionIssue(d: DivisionTeams): string | null {
    if (d.teams.length === 0) return null;
    if (mode[d.id] === "manual") {
      const p = placement[d.id];
      if (!p) return null;
      if (p.unassigned.length > 0) {
        return `${p.unassigned.length} team${p.unassigned.length > 1 ? "s" : ""} unassigned`;
      }
      const v = validatePoolStructure(
        p.pools.map((x) => x.length),
        d.teams.length,
      );
      return v.ok ? null : v.errors[0];
    }
    const v = validatePoolStructure(sizes[d.id] ?? [], d.teams.length);
    return v.ok ? null : v.errors[0];
  }

  const issues = divisions
    .map((d) => ({ d, issue: divisionIssue(d) }))
    .filter((x) => x.issue);
  const blocked = issues.length > 0;

  function generate() {
    if (blocked) {
      toast.error(`${issues[0].d.name}: ${issues[0].issue}`);
      return;
    }

    const orderByDivision: Record<string, string[]> = {};
    const structureByDivision: Record<
      string,
      { teamIds: string[]; short: boolean }[]
    > = {};
    for (const d of divisions) {
      if (d.teams.length === 0) continue;
      orderByDivision[d.id] = (orders[d.id] ?? []).map((t) => t.id);
      const pools =
        mode[d.id] === "manual"
          ? placement[d.id].pools
          : snakeDraftIntoSizes(
              (orders[d.id] ?? []).map((t) => t.id),
              sizes[d.id] ?? [],
            );
      structureByDivision[d.id] = pools.map((teamIds, i) => ({
        teamIds,
        short:
          mode[d.id] === "manual"
            ? effShort(d.id, i)
            : (short[d.id]?.[i] ?? false),
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
        const nameById = new Map(d.teams.map((t) => [t.id, t.name]));
        const isManual = mode[d.id] === "manual";

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Pool structure</p>
                <div className="border-border flex rounded-md border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => exitManual(d.id)}
                    className={cn(
                      "rounded px-2 py-1",
                      !isManual
                        ? "bg-accent font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    Auto draft
                  </button>
                  <button
                    type="button"
                    onClick={() => enterManual(d.id)}
                    className={cn(
                      "rounded px-2 py-1",
                      isManual
                        ? "bg-accent font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {isManual && placement[d.id]
                ? renderManual(d, nameById)
                : renderAuto(d, nameById)}
            </div>
          </div>
        );
      })}

      {blocked && (
        <p className="text-destructive flex items-center gap-1.5 text-sm">
          <TriangleAlert className="size-4" />
          Can&apos;t draw yet — {issues[0].d.name}: {issues[0].issue}
        </p>
      )}

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
              <Button variant="outline" disabled={blocked}>
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
          <Button onClick={generate} disabled={pending || blocked}>
            <Sparkles />
            {pending ? "Generating…" : "Generate pools"}
          </Button>
        )}
      </div>
    </div>
  );

  // --- renderers (closures over state/handlers) ---

  function renderAuto(d: DivisionTeams, nameById: Map<string, string>) {
    const divSizes = sizes[d.id] ?? [];
    const sum = divSizes.reduce((a, b) => a + b, 0);
    const v = validatePoolStructure(divSizes, d.teams.length);
    const preview = snakeDraftIntoSizes(
      (orders[d.id] ?? []).map((t) => t.id),
      divSizes,
    );
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-xs tabular-nums",
              sum === d.teams.length
                ? "text-muted-foreground"
                : "text-destructive",
            )}
          >
            {sum} of {d.teams.length} teams
          </span>
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
                    {plan.roundsPerTeam === 2 ? "double RR" : "round-robin"}
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
                    ? "Shorter games (2 sets to 15)"
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
          <p className="text-ink-2 flex items-center gap-1.5 text-xs">
            <TriangleAlert className="size-3.5" />
            {v.warnings[0]}
          </p>
        )}
      </div>
    );
  }

  function renderManual(d: DivisionTeams, nameById: Map<string, string>) {
    const p = placement[d.id];
    const v = validatePoolStructure(
      p.pools.map((x) => x.length),
      d.teams.length,
    );
    const sel = selected?.divId === d.id ? selected.teamId : null;

    const chip = (teamId: string) => (
      <button
        key={teamId}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", teamId);
          setSelected({ divId: d.id, teamId });
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelected(sel === teamId ? null : { divId: d.id, teamId });
        }}
        className={cn(
          "flex min-h-11 w-full items-center rounded-md border px-2 text-left text-xs transition-colors sm:min-h-9",
          sel === teamId
            ? "border-primary bg-accent ring-primary ring-2"
            : "border-border bg-surface hover:bg-muted",
        )}
      >
        {nameById.get(teamId) ?? "—"}
      </button>
    );

    const dropProps = (dest: MoveDest) => ({
      onDragOver: (e: DragEvent) => e.preventDefault(),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) applyMove(d.id, id, dest);
      },
      onClick: () => tapTarget(d.id, dest),
    });

    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          {sel
            ? `Moving ${nameById.get(sel)} — tap a pool or the bin to drop it.`
            : "Tap a team, then tap a pool to move it (or drag on desktop)."}
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {p.pools.map((teamIds, i) => (
            <div
              key={i}
              {...dropProps(i)}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                sel
                  ? "border-primary/60 bg-accent/40 cursor-pointer"
                  : "border-border bg-surface",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-semibold">
                  Pool {poolName(i)}
                  <span className="text-muted-foreground ml-1 text-xs font-normal tabular-nums">
                    ({teamIds.length})
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeManualPool(d.id, i);
                  }}
                  aria-label="Remove pool"
                  disabled={p.pools.length <= 1}
                >
                  <Minus />
                </Button>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleManualShort(d.id, i);
                }}
                className={cn(
                  "mt-2 w-full rounded-md border px-2 py-1 text-xs transition-colors",
                  effShort(d.id, i)
                    ? "border-primary bg-accent"
                    : "border-border bg-surface hover:bg-muted",
                )}
              >
                {effShort(d.id, i)
                  ? "Shorter games (2 sets to 15)"
                  : "Format: competition standard"}
              </button>
              <div className="mt-2 space-y-1">
                {teamIds.length === 0 ? (
                  <p className="text-muted-foreground py-2 text-center text-xs">
                    Empty — drop a team here
                  </p>
                ) : (
                  teamIds.map((id) => chip(id))
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => addManualPool(d.id)}
            className="border-border text-muted-foreground hover:bg-muted flex min-h-20 items-center justify-center gap-1 rounded-lg border border-dashed text-sm"
          >
            <Plus className="size-4" />
            Add pool
          </button>
        </div>

        {/* Unassigned bin */}
        <div
          {...dropProps("unassigned")}
          className={cn(
            "rounded-lg border border-dashed p-3 transition-colors",
            sel
              ? "border-primary/60 bg-accent/40 cursor-pointer"
              : "border-border",
            p.unassigned.length > 0 && "border-destructive/50",
          )}
        >
          <p className="text-xs font-medium">
            Unassigned
            <span className="text-muted-foreground ml-1 font-normal tabular-nums">
              ({p.unassigned.length})
            </span>
          </p>
          {p.unassigned.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {p.unassigned.map((id) => chip(id))}
            </div>
          )}
        </div>

        {v.warnings.length > 0 && p.unassigned.length === 0 && (
          <p className="text-ink-2 flex items-center gap-1.5 text-xs">
            <TriangleAlert className="size-3.5" />
            {v.warnings[0]}
          </p>
        )}
      </div>
    );
  }
}
