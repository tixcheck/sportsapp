"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { submitScoreAction } from "@/server/actions/scores";
import { setTarget, validateScore } from "@/lib/scoring/validation";
import type { MatchFormat } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Pair = { home: number; away: number };

function Stepper({
  value,
  onChange,
  emphasize,
}: {
  value: number;
  onChange: (v: number) => void;
  emphasize: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease"
      >
        <Minus />
      </Button>
      <span
        className={cn(
          "font-display w-12 text-center text-3xl tabular-nums",
          emphasize ? "text-coral-700" : "text-foreground",
        )}
      >
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        onClick={() => onChange(value + 1)}
        aria-label="Increase"
      >
        <Plus />
      </Button>
    </div>
  );
}

export function ScoreEntryForm({
  matchId,
  homeTeamName,
  awayTeamName,
  matchFormat,
  initialSets,
  requireConfirmation,
}: {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  matchFormat: MatchFormat;
  initialSets: Pair[];
  requireConfirmation: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sets, setSets] = useState<Pair[]>(() =>
    Array.from(
      { length: matchFormat.bestOf },
      (_, i) => initialSets[i] ?? { home: 0, away: 0 },
    ),
  );

  const played = useMemo(
    () => sets.filter((s) => s.home > 0 || s.away > 0),
    [sets],
  );
  const validation = useMemo(
    () => validateScore(matchFormat, played),
    [matchFormat, played],
  );

  function update(i: number, side: "home" | "away", v: number) {
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, [side]: v } : s)));
  }

  function submit() {
    if (played.length === 0) {
      toast.error("Enter a score for at least one set.");
      return;
    }
    if (!validation.ok) {
      toast.error(validation.errors[0]);
      return;
    }
    startTransition(async () => {
      const result = await submitScoreAction(matchId, played);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.requiresConfirmation
          ? "Score submitted — waiting for confirmation."
          : "Score recorded.",
      );
      router.push("/my-matches");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm font-medium">
        <span className="truncate">{homeTeamName}</span>
        <span className="text-muted-foreground text-xs">vs</span>
      </div>

      <div className="space-y-4">
        {sets.map((s, i) => {
          const target = setTarget(matchFormat, i);
          const homeWins = s.home > s.away;
          const awayWins = s.away > s.home;
          return (
            <div
              key={i}
              className="border-border bg-surface rounded-lg border p-3"
            >
              <p className="text-muted-foreground mb-2 text-xs">
                Set {i + 1} · to {target}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="w-24 truncate text-sm">{homeTeamName}</span>
                <Stepper
                  value={s.home}
                  onChange={(v) => update(i, "home", v)}
                  emphasize={homeWins}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="w-24 truncate text-sm">{awayTeamName}</span>
                <Stepper
                  value={s.away}
                  onChange={(v) => update(i, "away", v)}
                  emphasize={awayWins}
                />
              </div>
            </div>
          );
        })}
      </div>

      {validation.errors.length > 0 && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {validation.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {validation.errors.length === 0 && validation.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4" />
            Unusual, but allowed
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {validation.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Button
        onClick={submit}
        disabled={pending}
        size="lg"
        className="h-12 w-full"
      >
        {pending
          ? "Saving…"
          : requireConfirmation
            ? "Submit for confirmation"
            : "Record score"}
      </Button>
    </div>
  );
}
