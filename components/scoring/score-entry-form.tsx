"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  saveDraftSetsAction,
  submitScoreAction,
} from "@/server/actions/scores";
import { setTarget, validateScore } from "@/lib/scoring/validation";
import type { SetScoreInput } from "@/lib/scoring/validation";
import type { MatchFormat } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A set's two cells as raw input strings ("" = not yet entered, vs "0"). */
type Cell = { home: string; away: string };

function parse(v: string): number {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Entered sets (either cell filled), in order, parsed to numbers. */
function playedSets(cells: Cell[]): SetScoreInput[] {
  return cells
    .filter((c) => c.home !== "" || c.away !== "")
    .map((c) => ({ home: parse(c.home), away: parse(c.away) }));
}

function ScoreInput({
  value,
  onChange,
  onCommit,
  emphasize,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  emphasize: boolean;
  label: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
      onBlur={onCommit}
      className={cn(
        "border-border bg-surface focus-visible:ring-ring h-12 w-16 rounded-lg border text-center text-2xl tabular-nums focus-visible:ring-2 focus-visible:outline-none",
        emphasize ? "text-coral-700 font-semibold" : "text-foreground",
      )}
    />
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
  initialSets: { home: number; away: number }[];
  requireConfirmation: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sets, setSets] = useState<Cell[]>(() =>
    Array.from({ length: matchFormat.bestOf }, (_, i) => {
      const s = initialSets[i];
      return s
        ? { home: String(s.home), away: String(s.away) }
        : { home: "", away: "" };
    }),
  );

  const played = useMemo(() => playedSets(sets), [sets]);
  const validation = useMemo(
    () => validateScore(matchFormat, played),
    [matchFormat, played],
  );

  // Incremental save: persist what's entered when a field loses focus, without
  // completing the match. Skip redundant saves.
  const lastSaved = useRef(JSON.stringify(playedSets(sets)));
  function commit() {
    const current = playedSets(sets);
    const key = JSON.stringify(current);
    if (key === lastSaved.current) return;
    lastSaved.current = key;
    void saveDraftSetsAction(matchId, current).then((res) => {
      if (res && "error" in res) toast.error(res.error);
    });
  }

  function update(i: number, side: "home" | "away", v: string) {
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, [side]: v } : s)));
  }

  function record() {
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
          ? "Result submitted — waiting for confirmation."
          : "Result recorded.",
      );
      router.push("/my-matches");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {sets.map((s, i) => {
          const target = setTarget(matchFormat, i);
          const h = parse(s.home);
          const a = parse(s.away);
          const homeWins = (s.home !== "" || s.away !== "") && h > a;
          const awayWins = (s.home !== "" || s.away !== "") && a > h;
          return (
            <div
              key={i}
              className="border-border bg-surface rounded-lg border p-3"
            >
              <p className="text-muted-foreground mb-2 text-xs">
                Set {i + 1} · to {target}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {homeTeamName}
                </span>
                <ScoreInput
                  value={s.home}
                  onChange={(v) => update(i, "home", v)}
                  onCommit={commit}
                  emphasize={homeWins}
                  label={`${homeTeamName} score, set ${i + 1}`}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {awayTeamName}
                </span>
                <ScoreInput
                  value={s.away}
                  onChange={(v) => update(i, "away", v)}
                  onCommit={commit}
                  emphasize={awayWins}
                  label={`${awayTeamName} score, set ${i + 1}`}
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

      <p className="text-muted-foreground text-xs">
        Scores save as you type. Record the result when the match is done.
      </p>
      <Button
        onClick={record}
        disabled={pending}
        size="lg"
        className="h-12 w-full"
      >
        {pending
          ? "Saving…"
          : requireConfirmation
            ? "Submit for confirmation"
            : "Record result"}
      </Button>
    </div>
  );
}
