"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, TriangleAlert, Trophy } from "lucide-react";
import { toast } from "sonner";

import { generateBracketAction } from "@/server/actions/brackets";
import type { StandingsGroup } from "@/lib/standings/compute";
import {
  advancementCutoffTies,
  type AdvancementMode,
} from "@/lib/scheduler/tiebreakers";
import { bracketSeedTracks } from "@/lib/scheduler/bracket-project";
import {
  tournamentFormat,
  type FormatTemplate,
} from "@/lib/tournament-formats";
import { FORMAT_PRESETS, findPreset, type Sport } from "@/lib/formats";
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

/** A comma-separated court-list input for a bracket track (e.g. "1, 2, 3"). */
function CourtListInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [text, setText] = useState(value.join(", "));
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <Input
        value={text}
        inputMode="numeric"
        placeholder="1, 2, 3"
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = e.target.value
            .split(/[\s,]+/)
            .map((s) => parseInt(s, 10))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 99);
          onChange(parsed);
        }}
        className="w-40"
      />
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
  phaseLabel = "Pool play",
  playoffFormat,
  courts,
  allowReseed = false,
}: {
  competitionId: string;
  pools: StandingsGroup[];
  hasBracket: boolean;
  poolPlayComplete: boolean;
  formatTemplate: FormatTemplate;
  /** Every team in a needs_drop pool has chosen its drop. */
  dropsComplete: boolean;
  /** What the qualifying phase is called ("Pool play" / "The season"). */
  phaseLabel?: string;
  /**
   * When set, show a bracket match-format picker (e.g. best-of-3 playoffs off a
   * single-set league season). `default` pre-selects a preset id; "" = match the
   * competition's format. Omit for tournaments (bracket uses the comp format).
   */
  playoffFormat?: { sport: Sport; default: string };
  /** The competition's court count — the bracket defaults to using all of them. */
  courts?: number;
  /** Offer the re-seeding bracket option (single bracket only). */
  allowReseed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // Bracket match format (league playoffs only). "" = match the season format.
  const [formatId, setFormatId] = useState(playoffFormat?.default ?? "");
  // Re-seed each round (single bracket only): highest survivor plays lowest.
  const [reseed, setReseed] = useState(false);

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
    if (!isDual)
      setOrder(
        bracketSeedTracks(poolRows, "single", { mode, n: Math.min(n, nMax) })
          .championship,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, n, totalTeams, isDual, rankingKey]);

  // --- dual brackets: overall ranking split into Championship + Consolation --
  const defaultSplit = tournamentFormat("champ_consolation").split!;
  const [champSize, setChampSize] = useState(defaultSplit.championship);
  const [consoSize, setConsoSize] = useState(defaultSplit.consolation);
  const [champOrder, setChampOrder] = useState<string[]>([]);
  const [consoOrder, setConsoOrder] = useState<string[]>([]);

  // Courts per track — a round's games are spread across these (round-robin), so
  // every court is used; the final is left blank for the organizer. Defaults to
  // all of the competition's courts.
  const allCourts =
    courts && courts >= 1
      ? Array.from({ length: courts }, (_, i) => i + 1)
      : [1, 2, 3];
  const [champCourts, setChampCourts] = useState<number[]>(allCourts);
  const [consoCourts, setConsoCourts] = useState<number[]>(allCourts);
  useEffect(() => {
    if (!isDual) return;
    const { championship, consolation } = bracketSeedTracks(
      poolRows,
      "champ_consolation",
      { championship: champSize, consolation: consoSize },
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
    const bracketFormat =
      playoffFormat && formatId
        ? findPreset(playoffFormat.sport, formatId).format
        : null;
    startTransition(async () => {
      const res = await generateBracketAction(
        competitionId,
        payload,
        {
          championship: champCourts,
          consolation: consoCourts,
        },
        bracketFormat,
        !isDual && reseed,
      );
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
          {phaseLabel} isn&apos;t finished — seeds may change as remaining
          results come in.
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

      {playoffFormat && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Playoff format</p>
          <select
            value={formatId}
            onChange={(e) => setFormatId(e.target.value)}
            className="border-border bg-surface h-9 w-full max-w-sm rounded-md border px-2 text-sm"
          >
            <option value="">Match the season format</option>
            {FORMAT_PRESETS[playoffFormat.sport].map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            The bracket can use a different format than the season — e.g.
            best-of-3 playoffs off a single-set season.
          </p>
        </div>
      )}

      {allowReseed && !isDual && (
        <label className="border-border bg-surface flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-4"
            checked={reseed}
            onChange={(e) => setReseed(e.target.checked)}
          />
          <span>
            <span className="font-medium">Re-seed each round.</span> After every
            round the surviving teams are re-ranked by seed and the highest
            plays the lowest (1 v 6, 2 v 5, …). Built round-by-round, so later
            rounds appear as each one finishes.
          </span>
        </label>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-4">
          <CourtListInput
            label={isDual ? "Championship courts" : "Bracket courts"}
            value={champCourts}
            onChange={setChampCourts}
          />
          {isDual && consoOrder.length > 0 && (
            <CourtListInput
              label="Consolation courts"
              value={consoCourts}
              onChange={setConsoCourts}
            />
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Each round&apos;s games are spread across these courts; the final is
          left for you to set.
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
