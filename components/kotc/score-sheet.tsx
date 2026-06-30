"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { SheetRound } from "@/lib/kotc/scoresheet";

/**
 * Paper-style read-only score sheet. Each round is a collapsible section (the
 * active round open by default); inside, every pair gets a 1–N tally where each
 * scored cell reads "{point}-{opponent}" (paper format "1-P2") and unbroken King
 * runs are highlighted. Pure display of what the rally log already captured.
 */
export function ScoreSheet({
  rounds,
  names,
  pairOrder,
  pointCap,
}: {
  rounds: SheetRound[];
  names: Record<string, string>;
  pairOrder: string[];
  pointCap: number | null;
}) {
  // Short pool labels P1, P2, … matching the paper sheet.
  const label = new Map(pairOrder.map((id, i) => [id, `P${i + 1}`]));
  const labelOf = (id: string) => label.get(id) ?? "?";
  const nameOf = (id: string) => names[id] ?? "—";

  const [open, setOpen] = useState<Set<number>>(
    () => new Set(rounds.filter((r) => r.active).map((r) => r.roundIndex)),
  );
  const toggle = (ri: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(ri)) next.delete(ri);
      else next.add(ri);
      return next;
    });

  if (rounds.length === 0) return null;

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">Score sheet</p>
      <div className="space-y-2">
        {rounds.map((round) => {
          const isOpen = open.has(round.roundIndex);
          const cols = Math.max(
            15,
            pointCap ?? 0,
            ...round.teams.map((t) => t.totalPoints),
          );
          // Rank within the round by points, then longest streak.
          const ranked = [...round.teams].sort(
            (a, b) =>
              b.totalPoints - a.totalPoints ||
              b.longestStreak - a.longestStreak,
          );
          const rankOf = new Map(ranked.map((t, i) => [t.teamId, i + 1]));

          return (
            <div
              key={round.roundIndex}
              className="border-border overflow-hidden rounded-md border"
            >
              <button
                onClick={() => toggle(round.roundIndex)}
                className="bg-surface flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
              >
                <span className="flex items-center gap-1.5">
                  {isOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  Round {round.roundIndex + 1}
                  {round.active && (
                    <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                      live
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {round.teams.reduce((s, t) => s + t.totalPoints, 0)} pts
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 p-3">
                  {round.teams.map((team) => (
                    <div key={team.teamId} className="space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-muted-foreground w-7 font-medium tabular-nums">
                          {labelOf(team.teamId)}
                        </span>
                        <span className="truncate font-medium">
                          {nameOf(team.teamId)}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {team.totalPoints} pts · streak {team.longestStreak} ·
                          rank {rankOf.get(team.teamId)}
                        </span>
                      </div>
                      {/* 1–N tally — horizontally scrollable on mobile */}
                      <div className="-mx-1 overflow-x-auto px-1">
                        <div className="flex gap-1">
                          {Array.from({ length: cols }, (_, i) => {
                            const pt = team.points[i];
                            return (
                              <div
                                key={i}
                                className={[
                                  "flex h-8 w-12 shrink-0 flex-col items-center justify-center rounded border text-[10px] tabular-nums",
                                  pt
                                    ? pt.inStreak
                                      ? "border-primary/40 bg-primary/15 text-foreground"
                                      : "border-border bg-surface text-foreground"
                                    : "border-border/50 text-muted-foreground/50",
                                ].join(" ")}
                              >
                                {pt ? (
                                  <span className="font-medium">
                                    {pt.pointNumber}-
                                    {labelOf(pt.opponentTeamId)}
                                  </span>
                                ) : (
                                  <span>{i + 1}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
