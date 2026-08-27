"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListOrdered, Plus, RotateCcw, Save, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";

import type { FreeAgent } from "@/lib/queries/free-agents";
import {
  clearDraftAction,
  saveDraftAction,
  setDraftRanksAction,
} from "@/server/actions/draft";
import { seedRanks, snakeDraft } from "@/lib/draft/snake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const POOL = "__pool__";

/** Short labels, because a column is narrow and "Right Side Hitter" is not. */
const SHORT: Record<string, string> = {
  "Outside Hitter": "OH",
  "Right Side Hitter": "RS",
  "Middle Blocker": "M",
  Setter: "S",
  Libero: "L",
};

type Board = Record<string, string[]>;

/**
 * Drag players from the pool onto teams.
 *
 * Native HTML5 drag and drop with a tap-to-select fallback, matching
 * `generate-pools-panel.tsx` — dragging is nicer on a laptop, and an organizer
 * doing this on a phone at the gym needs the taps. No drag library: the same
 * twenty lines already work elsewhere in this app.
 *
 * Nothing is written until Save. The board is the unit of work, because a
 * half-applied draft is worse than an unsaved one, and moving somebody from one
 * team to another is a single thought that should not be two writes.
 */
export function DraftBoard({
  competitionId,
  agents,
  teams,
  teamSize = 7,
  defaultTeams = 4,
}: {
  competitionId: string;
  agents: FreeAgent[];
  teams: { id: string; name: string }[];
  /** Target roster size, used only to show how full a team is. */
  teamSize?: number;
  /** How many empty columns to offer when no teams exist yet. */
  defaultTeams?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  /**
   * The team columns. `id` is null for one the organizer just added — the save
   * action creates those. A league that has never drafted starts with no teams
   * at all, so the board has to be able to make them or it is unusable on day
   * one, which is exactly when it is needed.
   */
  const [columns, setColumns] = useState<
    { key: string; id: string | null; name: string }[]
  >(() =>
    teams.length > 0
      ? teams.map((t) => ({ key: t.id, id: t.id, name: t.name }))
      : Array.from({ length: defaultTeams }, (_, i) => ({
          key: `new-${i}`,
          id: null,
          name: `Team ${i + 1}`,
        })),
  );

  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const [board, setBoard] = useState<Board>(() => {
    const next: Board = { [POOL]: [] };
    for (const t of teams) next[t.id] = [];
    for (let i = 0; i < defaultTeams; i++) next[`new-${i}`] ??= [];
    for (const a of agents) {
      const col =
        a.placedTeamId && next[a.placedTeamId] ? a.placedTeamId : POOL;
      next[col].push(a.id);
    }
    return next;
  });
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      teams.length > 0
        ? teams.map((t) => [t.id, t.name])
        : Array.from({ length: defaultTeams }, (_, i) => [
            `new-${i}`,
            `Team ${i + 1}`,
          ]),
    ),
  );
  const [held, setHeld] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ranking, setRanking] = useState(false);

  /**
   * Strength within a position, 1 = best. Seeded from list order for anyone the
   * organizer has not ranked yet, so the auto-draft always has something to
   * work from rather than refusing until every box is filled.
   */
  const [ranks, setRanks] = useState<Record<string, number>>(() => {
    const seeded = seedRanks(
      agents.map((a) => ({ id: a.id, position: a.positions[0] ?? "—" })),
    );
    return Object.fromEntries(
      agents.map((a) => [a.id, a.draftRank ?? seeded.get(a.id) ?? 1]),
    );
  });
  const [ranksDirty, setRanksDirty] = useState(false);

  function move(playerId: string, to: string) {
    setBoard((prev) => {
      const next: Board = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = v.filter((id) => id !== playerId);
      }
      (next[to] ??= []).push(playerId);
      return next;
    });
    setHeld(null);
    setDirty(true);
  }

  function save() {
    start(async () => {
      const res = await saveDraftAction({
        competitionId,
        teams: columns.map((c) => ({
          id: c.id,
          name: names[c.key]?.trim() || c.name,
          playerIds: board[c.key] ?? [],
        })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setDirty(false);
      toast.success(
        `Draft saved — ${res.placed} placed${res.returned ? `, ${res.returned} back in the pool` : ""}.`,
      );
      router.refresh();
    });
  }

  /**
   * Deal the whole pool out by the organizer's rule: rank each position, then
   * one snake through the groups so the strong and the weak cancel. See
   * lib/draft/snake.ts.
   *
   * This fills the board and stops. Nothing is written, because an auto-draft
   * is a starting point an organizer argues with, not a decision — he still
   * has to look at it, drag two people, and press Save.
   */
  function autoDraft() {
    const everyone = [
      ...(board[POOL] ?? []),
      ...columns.flatMap((c) => board[c.key] ?? []),
    ];
    const dealt = snakeDraft(
      everyone.map((id) => ({
        id,
        position: byId.get(id)?.positions[0] ?? "—",
        rank: ranks[id] ?? null,
      })),
      { teams: columns.length },
    );

    const next: Board = { [POOL]: [] };
    columns.forEach((c, i) => {
      next[c.key] = dealt[i] ?? [];
    });
    setBoard(next);
    setHeld(null);
    setDirty(true);
  }

  function saveRanks() {
    start(async () => {
      const res = await setDraftRanksAction({
        competitionId,
        ranks: Object.entries(ranks).map(([playerId, rank]) => ({
          playerId,
          rank,
        })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setRanksDirty(false);
      toast.success("Ranks saved.");
      router.refresh();
    });
  }

  function clearAll() {
    start(async () => {
      const res = await clearDraftAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.returned} players returned to the pool.`);
      router.refresh();
    });
  }

  /** "3 OH · 2 M · 1 S" — what this team is short of, at a glance. */
  function breakdown(ids: string[]): string {
    const counts = new Map<string, number>();
    for (const id of ids) {
      const p = byId.get(id);
      const pos = p?.positions[0] ?? "—";
      counts.set(pos, (counts.get(pos) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pos, n]) => `${n} ${SHORT[pos] ?? pos}`)
      .join(" · ");
  }

  const chip = (id: string) => {
    const p = byId.get(id);
    if (!p) return null;
    const on = held === id;

    // While ranking, the chip is a form row rather than a draggable token —
    // dragging and typing in the same control fight each other on touch.
    if (ranking) {
      return (
        <div
          key={id}
          className="border-rule bg-paper-raised flex min-h-10 w-full items-center gap-2 rounded-md border px-2 py-1 text-sm"
        >
          <Input
            type="number"
            min={1}
            value={ranks[id] ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setRanks((r) => ({
                ...r,
                [id]: Number.isFinite(n) && n > 0 ? n : 1,
              }));
              setRanksDirty(true);
            }}
            className="h-7 w-14 shrink-0 px-1.5 text-center tabular-nums"
            aria-label={`Rank for ${p.name}`}
          />
          <span className="truncate">{p.name}</span>
          <span className="text-ink-3 ml-auto shrink-0 text-[0.7rem]">
            {p.positions.map((x) => SHORT[x] ?? x).join("/")}
          </span>
        </div>
      );
    }

    return (
      <button
        key={id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", id);
          setHeld(id);
        }}
        onDragEnd={() => setHeld(null)}
        onClick={() => setHeld(on ? null : id)}
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-sm transition-colors",
          on
            ? "border-claret bg-claret-tint ring-claret ring-2"
            : "border-rule bg-paper-raised hover:bg-paper-sunken",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-ink-3 shrink-0 text-[0.7rem] tabular-nums">
            {ranks[id] ?? "–"}
          </span>
          <span className="truncate">{p.name}</span>
        </span>
        <span className="text-ink-3 shrink-0 text-[0.7rem]">
          {p.positions.map((x) => SHORT[x] ?? x).join("/")}
        </span>
      </button>
    );
  };

  const dropProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) move(id, key);
    },
    onClick: () => {
      if (held) move(held, key);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Draft
        </CardTitle>
        <CardDescription>
          {ranking
            ? "Number each position from 1 (best). Auto-draft deals them out so the ends cancel — the 1st and the 8th outside land on the same team."
            : "Drag a player onto a team — or tap the player, then tap the team. Nothing is saved until you press Save."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {held && (
          <p className="text-claret text-sm">
            Moving <b>{byId.get(held)?.name}</b> — tap a team to drop them.
          </p>
        )}

        {ranking ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[...new Set(agents.map((a) => a.positions[0] ?? "—"))].map(
              (pos) => {
                const inGroup = agents
                  .filter((a) => (a.positions[0] ?? "—") === pos)
                  .sort((a, b) => (ranks[a.id] ?? 999) - (ranks[b.id] ?? 999));
                return (
                  <div
                    key={pos}
                    className="border-rule bg-surface flex flex-col gap-2 rounded-lg border p-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold">{pos}</h3>
                      <span className="text-ink-3 text-xs tabular-nums">
                        {inGroup.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {inGroup.map((a) => chip(a.id))}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            {/* The pool */}
            <div
              {...dropProps(POOL)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
                held
                  ? "border-claret/60 bg-claret-tint/40 cursor-pointer"
                  : "border-rule bg-surface",
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Available</h3>
                <span className="text-ink-3 text-xs tabular-nums">
                  {board[POOL]?.length ?? 0}
                </span>
              </div>
              <p className="text-ink-3 text-xs">
                {breakdown(board[POOL] ?? [])}
              </p>
              <div className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
                {(board[POOL] ?? []).map(chip)}
              </div>
            </div>

            {/* The teams */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {columns.map((c) => {
                const ids = board[c.key] ?? [];
                const full = ids.length >= teamSize;
                return (
                  <div
                    key={c.key}
                    {...dropProps(c.key)}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
                      held
                        ? "border-claret/60 bg-claret-tint/40 cursor-pointer"
                        : "border-rule bg-surface",
                    )}
                  >
                    <Input
                      value={names[c.key] ?? c.name}
                      onChange={(e) => {
                        setNames((n) => ({ ...n, [c.key]: e.target.value }));
                        setDirty(true);
                      }}
                      className="h-8 text-sm font-semibold"
                      aria-label={`Name for ${c.name}`}
                    />
                    <div className="flex items-baseline justify-between">
                      <span className="text-ink-3 text-xs">
                        {breakdown(ids) || "empty"}
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          full ? "text-pine font-semibold" : "text-ink-3",
                        )}
                      >
                        {ids.length}/{teamSize}
                      </span>
                    </div>
                    <div className="flex min-h-24 flex-col gap-1.5">
                      {ids.map(chip)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending || !dirty || ranking}>
            <Save className="size-4" />
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const key = `new-${columns.length}-${Date.now()}`;
              setColumns((c) => [
                ...c,
                { key, id: null, name: `Team ${c.length + 1}` },
              ]);
              setNames((n) => ({ ...n, [key]: `Team ${columns.length + 1}` }));
              setBoard((b) => ({ ...b, [key]: [] }));
            }}
            disabled={pending}
          >
            <Plus className="size-4" />
            Add team
          </Button>
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={pending || ranking}
            title="Empties every team and returns everyone to the pool. Teams, fixtures and results are kept."
          >
            <RotateCcw className="size-4" />
            Clear all teams
          </Button>

          <span className="bg-rule mx-1 hidden h-6 w-px sm:block" />

          <Button
            variant="outline"
            onClick={() => setRanking((r) => !r)}
            disabled={pending}
          >
            <ListOrdered className="size-4" />
            {ranking ? "Done ranking" : "Rank players"}
          </Button>
          {ranking ? (
            <Button onClick={saveRanks} disabled={pending || !ranksDirty}>
              <Save className="size-4" />
              {pending ? "Saving…" : "Save ranks"}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={autoDraft}
              disabled={pending}
              title="Deals every player out by rank: one snake through the positions, so team 1 takes the best and the worst outside, team 4 takes the middle two."
            >
              <Wand2 className="size-4" />
              Auto-draft by rank
            </Button>
          )}
          {dirty && !ranking && (
            <span className="text-ink-3 text-xs">Unsaved changes</span>
          )}
          {ranksDirty && ranking && (
            <span className="text-ink-3 text-xs">Unsaved ranks</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
