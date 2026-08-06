"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";

import { saveLadderSettingsAction } from "@/server/actions/ladder";
import { canSplitEvenly, tierNightVolume } from "@/lib/scheduler/ladder-split";
import type { LadderUnit } from "@/lib/validations/ladder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface LadderWizardTier {
  divisionId: string;
  name: string;
  teamCount: number;
}

/**
 * Ladder setup, one question per screen.
 *
 * The settings interact — the per-night target only makes sense once you know
 * how big a tier is, and the swap counts only once you know how many tiers
 * there are — so each step shows the consequence of the answer before moving
 * on. Nothing is saved until the summary is confirmed.
 */
export function LadderSetupWizard({
  competitionId,
  tiers,
  courts,
  initial,
}: {
  competitionId: string;
  /** Tiers top-first, with how many teams sit in each today. */
  tiers: LadderWizardTier[];
  /** Courts available on a league night — drives the capacity warning. */
  courts: number;
  initial: {
    enabled: boolean;
    unit: LadderUnit;
    target: number;
    swaps: number[];
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  const [unit, setUnit] = useState<LadderUnit>(initial.unit);
  const [target, setTarget] = useState(initial.target);
  const [swaps, setSwaps] = useState<number[]>(initial.swaps);

  const boundaries = Math.max(0, tiers.length - 1);
  const swapAt = (i: number) => swaps[i] ?? 1;

  function reset() {
    setStep(0);
    setUnit(initial.unit);
    setTarget(initial.target);
    setSwaps(initial.swaps);
  }

  // Steps: 0 = target unit, 1 = target amount, then one per boundary, then a
  // summary. Boundaries get their own screen each so a three-tier ladder is
  // two plain questions rather than one grid of numbers.
  const lastStep = 2 + boundaries;

  const capacity = useMemo(
    () =>
      tiers.map((t) => ({
        name: t.name,
        teams: t.teamCount,
        volume: tierNightVolume(t.teamCount, target),
        even: canSplitEvenly(t.teamCount, target),
      })),
    [tiers, target],
  );
  const nightVolume = capacity.reduce((sum, c) => sum + c.volume, 0);
  const wavesNeeded = courts > 0 ? Math.ceil(nightVolume / courts) : 0;
  const uneven = capacity.filter((c) => c.teams >= 2 && !c.even);

  function save() {
    start(async () => {
      const res = await saveLadderSettingsAction({
        competitionId,
        enabled: true,
        unit,
        target,
        swaps: Array.from({ length: boundaries }, (_, i) => swapAt(i)),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Ladder format saved.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Layers className="size-4" />
          {initial.enabled ? "Ladder settings" : "Set up ladder"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ladder format</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {lastStep + 1}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[11rem] space-y-4">
          {step === 0 && (
            <div className="space-y-3">
              <p className="font-medium">
                What should each team get a fixed number of per night?
              </p>
              <div className="grid gap-2">
                {(["sets", "games"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`rounded-md border px-3 py-2 text-left text-sm ${
                      unit === u
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <span className="font-medium capitalize">{u}</span>
                    <span className="text-muted-foreground block text-xs">
                      {u === "sets"
                        ? "Each set is scored on its own — the usual choice for a ladder night."
                        : "Each game uses the league's match format."}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="font-medium">
                How many {unit} does each team play per night?
              </p>
              <Input
                type="number"
                min={1}
                max={40}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="max-w-28"
                aria-label={`${unit} per team per night`}
              />
              <div className="text-muted-foreground space-y-1 text-xs">
                {capacity.map((c) => (
                  <p key={c.name}>
                    <span className="text-foreground font-medium">
                      {c.name}
                    </span>{" "}
                    — {c.teams} teams → {c.volume} {unit} on the night
                    {!c.even && c.teams >= 2 && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {" "}
                        · one team gets {target - 1}
                      </span>
                    )}
                  </p>
                ))}
                <p className="pt-1">
                  {nightVolume} {unit} across {courts}{" "}
                  {courts === 1 ? "court" : "courts"} ≈ {wavesNeeded} rounds of
                  play.
                </p>
              </div>
              {uneven.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {uneven.map((u) => u.name).join(", ")} can&apos;t split{" "}
                  {target} evenly — one team is a {unit.slice(0, -1)} short each
                  week, and we rotate who.
                </p>
              )}
            </div>
          )}

          {step >= 2 && step < lastStep && (
            <div className="space-y-3">
              {(() => {
                const i = step - 2;
                const above = tiers[i];
                const below = tiers[i + 1];
                return (
                  <>
                    <p className="font-medium">
                      How many teams swap between {above.name} and {below.name}?
                    </p>
                    <Input
                      type="number"
                      min={0}
                      max={Math.max(above.teamCount, below.teamCount)}
                      value={swapAt(i)}
                      onChange={(e) => {
                        const next = [...swaps];
                        next[i] = Number(e.target.value);
                        setSwaps(next);
                      }}
                      className="max-w-28"
                      aria-label={`Teams swapping between ${above.name} and ${below.name}`}
                    />
                    <p className="text-muted-foreground text-xs">
                      The bottom {swapAt(i)} of {above.name} drop, and the top{" "}
                      {swapAt(i)} of {below.name} come up. It&apos;s a straight
                      swap, so both tiers stay the size they are today (
                      {above.teamCount} and {below.teamCount}).
                    </p>
                    {swapAt(i) * 2 >
                      Math.min(above.teamCount, below.teamCount) &&
                      swapAt(i) > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          That&apos;s a lot of movement for tiers this size —
                          most of a tier changes every week.
                        </p>
                      )}
                  </>
                );
              })()}
            </div>
          )}

          {step === lastStep && (
            <div className="space-y-3">
              <p className="font-medium">
                Ready to switch this league to a ladder
              </p>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>
                  Every team plays{" "}
                  <span className="text-foreground font-medium">
                    {target} {unit}
                  </span>{" "}
                  a night, inside their own tier.
                </li>
                {tiers.slice(0, -1).map((t, i) => (
                  <li key={t.divisionId}>
                    <span className="text-foreground font-medium">
                      {swapAt(i)}
                    </span>{" "}
                    {swapAt(i) === 1 ? "team swaps" : "teams swap"} between{" "}
                    {t.name} and {tiers[i + 1].name} each week.
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
                The season schedule can&apos;t be generated up front — who plays
                whom depends on last week&apos;s results. You&apos;ll draw each
                week, then lock it once the scores are in.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          {step < lastStep ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={pending || (step === 1 && target < 1)}
            >
              Next
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Turn on ladder format"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
