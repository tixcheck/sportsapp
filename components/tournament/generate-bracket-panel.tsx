"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, TriangleAlert, Trophy } from "lucide-react";
import { toast } from "sonner";

import { generateBracketAction } from "@/server/actions/brackets";
import type { StandingsGroup } from "@/lib/standings/compute";
import {
  advancementCutoffTies,
  crossPoolSeedOrder,
  selectAdvancers,
  type AdvancementMode,
} from "@/lib/scheduler/tiebreakers";
import { splitSeeds } from "@/lib/scheduler/bracket";
import {
  tournamentFormat,
  type FormatTemplate,
} from "@/lib/tournament-formats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function moveIn(list: string[], i: number, dir: -1 | 1): string[] {
  const out = [...list];
  const j = i + dir;
  if (j < 0 || j >= out.length) return list;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Reorderable seed list (coin-flip ties) — shared by single + dual previews. */
function SeedList({
  order,
  nameById,
  onMove,
}: {
  order: string[];
  nameById: Map<string, string>;
  onMove: (i: number, dir: -1 | 1) => void;
}) {
  return (
    <ol className="divide-rule border-rule divide-y rounded-lg border">
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
              onClick={() => onMove(i, -1)}
              aria-label="Move up"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={i === order.length - 1}
              onClick={() => onMove(i, 1)}
              aria-label="Move down"
            >
              <ArrowDown />
            </Button>
          </span>
        </li>
      ))}
    </ol>
  );
}

function SizeStepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  const shown = Math.min(value, max);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(Math.max(min, shown - 1))}
          aria-label={`Fewer ${label}`}
        >
          −
        </Button>
        <span className="w-6 text-center text-sm tabular-nums">{shown}</span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(Math.min(max, shown + 1))}
          aria-label={`More ${label}`}
        >
          +
        </Button>
      </div>
    </div>
  );
}

/** A [lowerCourt, higherCourt] pair input for a bracket track. */
function CourtPairInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const set = (i: 0 | 1, raw: string) => {
    const n = Math.min(99, Math.max(1, parseInt(raw, 10) || 1));
    const next: [number, number] = [value[0], value[1]];
    next[i] = n;
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={99}
          value={value[0]}
          onChange={(e) => set(0, e.target.value)}
          className="w-16"
          aria-label={`${label}: top-half court`}
        />
        <span className="text-muted-foreground text-sm">&amp;</span>
        <Input
          type="number"
          min={1}
          max={99}
          value={value[1]}
          onChange={(e) => set(1, e.target.value)}
          className="w-16"
          aria-label={`${label}: bottom-half court`}
        />
      </div>
    </div>
  );
}

export function GenerateBracketPanel({
  competitionId,
  pools,
  hasBracket,
  poolPlayComplete,
  formatTemplate,
  dropsComplete,
}: {
  competitionId: string;
  pools: StandingsGroup[];
  hasBracket: boolean;
  poolPlayComplete: boolean;
  formatTemplate: FormatTemplate;
  /** Every team in a needs_drop pool has chosen its drop. */
  dropsComplete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const poolRows = pools.map((g) => g.rows);
  const nameById = new Map(
    pools.flatMap((g) => g.rows.map((r) => [r.teamId, r.teamName] as const)),
  );
  const totalTeams = poolRows.reduce((s, p) => s + p.length, 0);
  const maxPerPool = poolRows.reduce((m, p) => Math.max(m, p.length), 0);
  // Signature of the live ranking (team order across pools). When scores shift
  // the standings, this changes and the seed preview re-seeds — so it tracks
  // the current ranking, not a mount-time snapshot.
  const rankingKey = poolRows
    .map((p) => p.map((r) => r.teamId).join(","))
    .join("|");

  const isDual = formatTemplate === "champ_consolation";

  // --- single bracket: top-N per pool / overall, one reorderable list --------
  const [mode, setMode] = useState<AdvancementMode>("perPool");
  const [n, setN] = useState(2);
  const [order, setOrder] = useState<string[]>([]);
  const nMax = mode === "perPool" ? Math.max(1, maxPerPool) : totalTeams;
  useEffect(() => {
    if (!isDual) setOrder(selectAdvancers(poolRows, mode, Math.min(n, nMax)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, n, totalTeams, isDual, rankingKey]);

  // --- dual brackets: overall ranking split into Championship + Consolation --
  const defaultSplit = tournamentFormat("champ_consolation").split!;
  const [champSize, setChampSize] = useState(defaultSplit.championship);
  const [consoSize, setConsoSize] = useState(defaultSplit.consolation);
  const [champOrder, setChampOrder] = useState<string[]>([]);
  const [consoOrder, setConsoOrder] = useState<string[]>([]);

  // Court pair per track — top half of the bracket plays the lower court, the
  // bottom half the higher; the final is left blank for the organizer.
  const [champCourts, setChampCourts] = useState<[number, number]>([1, 2]);
  const [consoCourts, setConsoCourts] = useState<[number, number]>([3, 4]);
  useEffect(() => {
    if (!isDual) return;
    const fullOrder = crossPoolSeedOrder(poolRows);
    const { championship, consolation } = splitSeeds(
      fullOrder,
      champSize,
      consoSize,
    );
    setChampOrder(championship);
    setConsoOrder(consolation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champSize, consoSize, totalTeams, isDual, rankingKey]);

  const ties = isDual
    ? []
    : advancementCutoffTies(poolRows, mode, Math.min(n, nMax));
  const tieNames = ties
    .flat()
    .map((id) => nameById.get(id) ?? "?")
    .join(", ");

  function generate() {
    const payload = isDual
      ? { championship: champOrder, consolation: consoOrder }
      : { championship: order };
    if (payload.championship.length < 2) {
      toast.error("At least 2 teams must advance.");
      return;
    }
    startTransition(async () => {
      const res = await generateBracketAction(competitionId, payload, {
        championship: champCourts,
        consolation: consoCourts,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isDual
          ? "Championship + Consolation brackets generated."
          : `Bracket generated with ${order.length} teams.`,
      );
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

  const blocked = !dropsComplete;

  return (
    <div className="space-y-4">
      {!poolPlayComplete && (
        <p className="text-ink-2 flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3.5" />
          Pool play isn&apos;t finished — seeds may change as remaining results
          come in.
        </p>
      )}
      {blocked && (
        <p className="text-claret flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3.5" />
          Set every team&apos;s dropped game in the flagged pools before
          generating.
        </p>
      )}

      {isDual ? (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <SizeStepper
              label="Championship"
              value={champSize}
              onChange={setChampSize}
              min={2}
              max={totalTeams}
            />
            <SizeStepper
              label="Consolation"
              value={consoSize}
              onChange={setConsoSize}
              min={0}
              max={Math.max(0, totalTeams - Math.min(champSize, totalTeams))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Championship
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {champOrder.length} teams
                </span>
              </p>
              <SeedList
                order={champOrder}
                nameById={nameById}
                onMove={(i, dir) => setChampOrder((o) => moveIn(o, i, dir))}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Consolation
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {consoOrder.length} teams
                </span>
              </p>
              {consoOrder.length ? (
                <SeedList
                  order={consoOrder}
                  nameById={nameById}
                  onMove={(i, dir) => setConsoOrder((o) => moveIn(o, i, dir))}
                />
              ) : (
                <p className="text-ink-2 text-sm">
                  No teams in the consolation bracket.
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
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

            <SizeStepper
              label={mode === "perPool" ? "Per pool" : "Overall"}
              value={n}
              onChange={setN}
              min={mode === "overall" ? 2 : 1}
              max={nMax}
            />
          </div>

          {tieNames && (
            <p className="text-ink-2 flex items-start gap-1.5 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Tied at the cutoff: {tieNames}. Order is a fallback — drag with
              the arrows to enter a coin-flip result before generating.
            </p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Seed preview
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                {order.length} teams
              </span>
            </p>
            <SeedList
              order={order}
              nameById={nameById}
              onMove={(i, dir) => setOrder((o) => moveIn(o, i, dir))}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-4">
          <CourtPairInput
            label={isDual ? "Championship courts" : "Bracket courts"}
            value={champCourts}
            onChange={setChampCourts}
          />
          {isDual && consoOrder.length > 0 && (
            <CourtPairInput
              label="Consolation courts"
              value={consoCourts}
              onChange={setConsoCourts}
            />
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Top half of the bracket plays the first court, the bottom half the
          second; the final is left for you to set.
        </p>
      </div>

      {hasBracket ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={blocked}>
              <Trophy />
              Regenerate {isDual ? "brackets" : "bracket"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Regenerate {isDual ? "brackets" : "bracket"}?
              </DialogTitle>
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
                disabled={pending || blocked}
              >
                {pending ? "Regenerating…" : "Discard & regenerate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Button onClick={generate} disabled={pending || blocked}>
          <Trophy />
          {pending
            ? "Generating…"
            : isDual
              ? "Generate brackets"
              : "Generate bracket"}
        </Button>
      )}
    </div>
  );
}
