"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { toast } from "sonner";

import { setReversePairsBonusAction } from "@/server/actions/reverse-pairs-scoring";
import type { ReversePairsPair } from "@/lib/queries/reverse-pairs";
import { signedPoints, type BonusItem } from "@/lib/reverse-pairs/bonus";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Award the event's bonuses, a tap per pair per bonus (0192). Offlimits'
 * Halloween night: one in costume, both, matching — each ticked on its own,
 * so a pair in matching costumes gets all three.
 */
export function ReversePairsBonusCard({
  competitionId,
  pairs,
  items,
  awarded,
}: {
  competitionId: string;
  pairs: ReversePairsPair[];
  items: BonusItem[];
  /** pair id → labels already awarded. */
  awarded: Record<string, string[]>;
}) {
  const router = useRouter();
  // Never disables the buttons: a save plus a page refresh can take seconds,
  // and the next pair is already at the door.
  const [, start] = useTransition();
  const [state, setState] = useState(() => {
    const m = new Map<string, Set<string>>();
    for (const [id, labels] of Object.entries(awarded))
      m.set(id, new Set(labels));
    return m;
  });

  function toggle(teamId: string, label: string) {
    const has = state.get(teamId)?.has(label) ?? false;
    // Shown at once: at a gym door, waiting on a round trip per tap is slow.
    const flip = (on: boolean) =>
      setState((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(teamId) ?? []);
        if (on) set.add(label);
        else set.delete(label);
        next.set(teamId, set);
        return next;
      });
    flip(!has);
    start(async () => {
      const res = await setReversePairsBonusAction({
        competitionId,
        teamId,
        item: label,
        awarded: !has,
      });
      if ("error" in res) {
        flip(has);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const totalFor = (id: string) =>
    items
      .filter((i) => state.get(id)?.has(i.label))
      .reduce((n, i) => n + i.points, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" />
          Bonus points
        </CardTitle>
        <CardDescription>
          Tap each bonus a pair has earned. It&rsquo;s added once to the
          pair&rsquo;s points in the Standings ratio. Game scores and wins
          don&rsquo;t change.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-rule/60 divide-y">
          {pairs.map((p) => {
            const total = totalFor(p.id);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
              >
                <span className="min-w-28 flex-1 text-sm font-medium">
                  {/* The pair's own name: costumes are judged at the door,
                      often before they've drawn a number. */}
                  {p.drawNumberSet ? p.name : p.entryName}
                  {total !== 0 && (
                    <span className="text-pine ml-2 text-xs tabular-nums">
                      {signedPoints(total)}
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((i) => {
                    const on = state.get(p.id)?.has(i.label) ?? false;
                    return (
                      <Button
                        key={i.label}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        onClick={() => toggle(p.id, i.label)}
                        className="h-8 text-xs"
                      >
                        {on && "✓ "}
                        {i.label} {signedPoints(i.points)}
                      </Button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
