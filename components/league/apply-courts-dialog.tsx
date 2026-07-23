"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  previewApplyCourtsAction,
  applyCourtsToUpcomingAction,
  type ApplyCourtsPreview,
} from "@/server/actions/courts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Change how many courts the upcoming weeks use, without regenerating the
 * schedule. Re-spreads court assignments across the unplayed games only —
 * pairings, times, and played results stay put. Built for "we added a court so
 * all N teams can play at once."
 */
export function ApplyCourtsDialog({
  competitionId,
  currentCourts,
}: {
  competitionId: string;
  currentCourts: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(Math.min(20, currentCourts + 1));
  const [pending, startApply] = useTransition();
  const [loading, startPreview] = useTransition();
  const [preview, setPreview] = useState<ApplyCourtsPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !Number.isInteger(target) || target < 1) return;
    startPreview(async () => {
      const res = await previewApplyCourtsAction({
        competitionId,
        courts: target,
      });
      if ("error" in res) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setError(null);
      setPreview(res);
    });
  }, [open, target, competitionId]);

  function apply() {
    startApply(async () => {
      const res = await applyCourtsToUpcomingAction({
        competitionId,
        courts: target,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Re-spread ${res.reassigned} upcoming games across courts.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutGrid className="size-4" />
          Courts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply courts to upcoming weeks</DialogTitle>
          <DialogDescription>
            Re-spreads the unplayed games across the courts, keeping prime
            courts balanced across teams. Pairings, times, and played results
            stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {preview?.usesCustomCourts ? (
            <p className="text-muted-foreground text-sm">
              This league uses <strong>custom court names</strong> ({" "}
              {preview.targetCourts} courts). Add or remove courts in Edit
              settings → Custom courts, then apply here to spread the upcoming
              games across them.
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="courts">Number of courts</Label>
              <Input
                id="courts"
                type="number"
                min={1}
                max={20}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
              />
              <p className="text-muted-foreground text-xs">
                Currently {currentCourts}. With enough courts, every game in a
                time slot can play at once.
              </p>
            </div>
          )}

          {loading && (
            <p className="text-muted-foreground text-sm">Checking…</p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}

          {preview && !loading && (
            <div className="bg-muted/50 grid gap-2 rounded-md border p-3 text-sm">
              <p className="font-medium">
                {preview.currentCourts} → {preview.targetCourts} courts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.courts.map((c) => (
                  <span
                    key={c.label}
                    className={
                      c.prime
                        ? "bg-claret-tint text-claret-deep rounded-full px-2 py-0.5 text-xs font-semibold"
                        : "bg-paper-sunken text-ink-2 rounded-full px-2 py-0.5 text-xs font-medium"
                    }
                    title={c.prime ? "Prime court" : undefined}
                  >
                    {c.label}
                    {c.prime ? " ★" : ""}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground">
                {preview.reassigned} upcoming games re-spread across{" "}
                {preview.waves} time slots.{" "}
                <span className="text-foreground">
                  {preview.playedUntouched} played games untouched.
                </span>
              </p>
              <p className="text-muted-foreground">
                Busiest slot has {preview.maxGamesPerWave} games.{" "}
                {preview.courts.some((c) => c.prime)
                  ? "★ = prime, balanced across teams."
                  : ""}
              </p>
            </div>
          )}

          {preview && preview.overCapacityWaves > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" />
                Still short on courts
              </p>
              <p className="mt-1">
                {preview.overCapacityWaves} time slot
                {preview.overCapacityWaves === 1 ? "" : "s"} have more games (
                {preview.maxGamesPerWave}) than courts ({preview.targetCourts}),
                so some games would share a court. Add more courts to clear
                this.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={apply}
            disabled={
              pending || loading || !preview || preview.reassigned === 0
            }
          >
            {pending ? "Applying…" : "Apply courts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
