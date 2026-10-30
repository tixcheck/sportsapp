"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy, X } from "lucide-react";
import { toast } from "sonner";

import { updateReversePairsScoringAction } from "@/server/actions/reverse-pairs-scoring";
import type { ReversePairsRanking } from "@/lib/stats/reverse-pairs";
import { BONUS_LIMITS, type BonusItem } from "@/lib/reverse-pairs/bonus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const RANKINGS: { value: ReversePairsRanking; label: string; hint: string }[] =
  [
    {
      value: "differential",
      label: "Point differential",
      hint: "Every pair on a side takes the game's margin; the totals rank.",
    },
    {
      value: "wins_pct",
      label: "Wins, then points %",
      hint: "Most games won first; ties go to the higher share of points scored.",
    },
  ];

/**
 * How this night's standings rank, and the bonuses an organizer can award
 * (0192). Its own card and save, apart from the event form: it's about the
 * results, and changing it mid-night shouldn't resave the venue and times.
 */
export function ReversePairsScoringCard({
  competitionId,
  initial,
}: {
  competitionId: string;
  initial: { ranking: ReversePairsRanking; bonusItems: BonusItem[] };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ranking, setRanking] = useState(initial.ranking);
  const [items, setItems] = useState(
    initial.bonusItems.map((i) => ({ ...i, points: String(i.points) })),
  );

  function save() {
    start(async () => {
      const res = await updateReversePairsScoringAction({
        competitionId,
        ranking,
        bonusItems: items
          .filter((i) => i.label.trim() !== "")
          .map((i) => ({ label: i.label, points: Number(i.points) })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Scoring saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4" />
          Standings and bonuses
        </CardTitle>
        <CardDescription>
          How pairs are ranked, and any bonus points you award on the night.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2" role="radiogroup" aria-label="Rank by">
          <Label>Rank by</Label>
          {RANKINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={ranking === r.value}
              onClick={() => setRanking(r.value)}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                ranking === r.value
                  ? "border-primary bg-primary/5"
                  : "border-border",
              )}
            >
              <span className="font-medium">{r.label}</span>
              <span className="text-muted-foreground block text-xs">
                {r.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          <Label>Bonus points</Label>
          <p className="text-ink-3 text-xs">
            Added once for the night to a pair&rsquo;s points. You tick them per
            pair on the Tonight tab. Each one stacks.
          </p>
          {items.map((i, n) => (
            <div key={n} className="flex items-center gap-2">
              <Input
                aria-label="Bonus name"
                placeholder="e.g. Both in costume"
                maxLength={BONUS_LIMITS.label}
                value={i.label}
                onChange={(e) =>
                  setItems(
                    items.map((x, k) =>
                      k === n ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                aria-label="Points"
                type="number"
                className="w-20"
                value={i.points}
                onChange={(e) =>
                  setItems(
                    items.map((x, k) =>
                      k === n ? { ...x, points: e.target.value } : x,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove bonus"
                onClick={() => setItems(items.filter((_, k) => k !== n))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {items.length < BONUS_LIMITS.items && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => setItems([...items, { label: "", points: "2" }])}
            >
              Add a bonus
            </Button>
          )}
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
