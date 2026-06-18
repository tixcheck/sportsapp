"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  saveDraftSetsAction,
  submitScoreAction,
} from "@/server/actions/scores";
import {
  recordedDecision,
  setTarget,
  validateScore,
  validateSet,
} from "@/lib/scoring/validation";
import type { SetScoreInput } from "@/lib/scoring/validation";
import type { MatchFormat } from "@/lib/db/schema";
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

type Note = { type: "reject" | "warn"; message: string };
type SetRow = {
  home: string;
  away: string;
  /** The last value the user explicitly Recorded; null once edited. */
  recorded: SetScoreInput | null;
  note: Note | null;
};

function parse(v: string): number {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

function ScoreInput({
  value,
  onChange,
  emphasize,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  emphasize: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={value}
      placeholder="0"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
      className={cn(
        "border-border bg-surface focus-visible:ring-ring h-12 w-16 rounded-lg border text-center text-2xl tabular-nums focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
        emphasize ? "text-win font-semibold" : "text-foreground",
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
  isAdmin,
}: {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  matchFormat: MatchFormat;
  initialSets: { home: number; away: number }[];
  requireConfirmation: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sets, setSets] = useState<SetRow[]>(() =>
    Array.from({ length: matchFormat.bestOf }, (_, i) => {
      const s = initialSets[i];
      return {
        home: s ? String(s.home) : "",
        away: s ? String(s.away) : "",
        recorded: s ? { home: s.home, away: s.away } : null,
        note: null,
      };
    }),
  );

  const recorded = useMemo(
    () => sets.filter((s) => s.recorded).map((s) => s.recorded!),
    [sets],
  );
  const decision = recordedDecision(recorded, matchFormat.bestOf);
  const submitV = validateScore(matchFormat, recorded);
  const submitReason = submitV.errors[0] ?? submitV.blocks[0] ?? null;
  const canOverride =
    isAdmin && submitV.errors.length === 0 && submitV.blocks.length > 0;

  function update(i: number, side: "home" | "away", v: string) {
    setSets((prev) =>
      prev.map((s, j) =>
        j === i ? { ...s, [side]: v, recorded: null, note: null } : s,
      ),
    );
  }

  function record(i: number) {
    const cell = sets[i];
    const parsed = { home: parse(cell.home), away: parse(cell.away) };
    const v = validateSet(matchFormat, i, parsed);
    setSets((prev) =>
      prev.map((s, j) =>
        j === i
          ? {
              ...s,
              note:
                v.status === "ok"
                  ? null
                  : {
                      type: v.status === "reject" ? "reject" : "warn",
                      message: v.message!,
                    },
              recorded: v.status === "reject" ? s.recorded : parsed,
            }
          : s,
      ),
    );
    if (v.status !== "reject") {
      const next = sets.map((s, j) =>
        j === i ? { ...s, recorded: parsed } : s,
      );
      const toSave = next.filter((s) => s.recorded).map((s) => s.recorded!);
      void saveDraftSetsAction(matchId, toSave).then((res) => {
        if (res && "error" in res) toast.error(res.error);
      });
    }
  }

  function submit(override: boolean) {
    if (recorded.length === 0) {
      toast.error("Record at least one set.");
      return;
    }
    startTransition(async () => {
      const result = await submitScoreAction(matchId, recorded, override);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        override
          ? "Abnormal result recorded."
          : result.requiresConfirmation
            ? "Result submitted — waiting for confirmation."
            : "Result recorded.",
      );
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {sets.map((s, i) => {
          const target = setTarget(matchFormat, i);
          const isRecorded = s.recorded !== null;
          // Once the match is decided by other recorded sets, this unrecorded
          // row isn't needed — grey it out (reactive, recomputed each render).
          const greyed = decision.decided && !isRecorded;
          const h = parse(s.home);
          const a = parse(s.away);
          const entered = s.home !== "" || s.away !== "";
          return (
            <div
              key={i}
              className={cn(
                "border-border bg-surface rounded-lg border p-3 transition-opacity",
                greyed && "opacity-50",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  Set {i + 1} · to {target}
                </p>
                {isRecorded && (
                  <span className="text-win inline-flex items-center gap-1 text-xs font-medium">
                    <Check className="size-3.5" />
                    Recorded
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {homeTeamName}
                </span>
                <ScoreInput
                  value={s.home}
                  onChange={(v) => update(i, "home", v)}
                  emphasize={isRecorded && h > a}
                  disabled={greyed}
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
                  emphasize={isRecorded && a > h}
                  disabled={greyed}
                  label={`${awayTeamName} score, set ${i + 1}`}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs">
                  {s.note?.type === "reject" && (
                    <span className="text-loss">{s.note.message}</span>
                  )}
                  {s.note?.type === "warn" && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <TriangleAlert className="size-3.5" />
                      {s.note.message}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant={isRecorded ? "outline" : "default"}
                  size="sm"
                  disabled={greyed || !entered}
                  onClick={() => record(i)}
                >
                  {isRecorded ? "Re-record" : "Record"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {decision.decided && (
        <div className="border-border bg-surface rounded-lg border p-3 text-center text-sm">
          <span
            className={cn(
              decision.homeSetsWon > decision.awaySetsWon
                ? "text-win font-semibold"
                : "text-loss",
            )}
          >
            {homeTeamName}
          </span>{" "}
          <span className="tabular-nums">
            {decision.homeSetsWon}–{decision.awaySetsWon}
          </span>{" "}
          <span
            className={cn(
              decision.awaySetsWon > decision.homeSetsWon
                ? "text-win font-semibold"
                : "text-loss",
            )}
          >
            {awayTeamName}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <Button
          onClick={() => submit(false)}
          disabled={pending || !submitV.ok}
          size="lg"
          className="h-12 w-full"
        >
          {pending
            ? "Saving…"
            : requireConfirmation
              ? "Submit for confirmation"
              : "Submit score"}
        </Button>
        {!submitV.ok && submitReason && (
          <p className="text-muted-foreground text-center text-xs">
            {submitReason}
          </p>
        )}

        {canOverride && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-loss/40 text-loss w-full"
              >
                Record abnormal result (e.g. abandoned/injury)
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record an abnormal result?</DialogTitle>
                <DialogDescription>
                  This match isn&apos;t a normal complete result
                  {submitReason ? ` — ${submitReason}` : ""}. As the organizer
                  you can record what actually happened (e.g. abandoned or
                  injury). It&apos;s flagged abnormal but counts in standings as
                  entered.
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
                  onClick={() => submit(true)}
                  disabled={pending}
                >
                  {pending ? "Recording…" : "Record abnormal result"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
