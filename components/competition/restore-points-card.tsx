"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { History, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import type { RestorePointRow } from "@/lib/queries/restore-points";
import {
  deleteRestorePointAction,
  restoreFromPointAction,
} from "@/server/actions/restore-points";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Pending = {
  id: string;
  missingTeams: string[];
  rematchedTeams: string[];
  matchCount: number;
  resultCount: number;
};

/**
 * Restore points for a league.
 *
 * Restoring is NOT behind the type-the-name lock that erasing is, deliberately:
 * it takes a snapshot of the current state before it runs, so it is reversible,
 * and it is the control someone reaches for while panicking. A confirm that
 * names exactly what will be replaced is the right weight for a reversible act.
 *
 * The exception is a snapshot whose teams no longer line up — that gets a
 * second dialog, because restoring a schedule with silent holes in it is worse
 * than not restoring at all.
 */
export function RestorePointsCard({
  points,
  timezone,
}: {
  points: RestorePointRow[];
  timezone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<RestorePointRow | null>(null);
  const [mismatch, setMismatch] = useState<Pending | null>(null);

  function run(id: string, acceptPartial: boolean) {
    start(async () => {
      const res = await restoreFromPointAction({
        restorePointId: id,
        acceptPartial,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("needsConfirmation" in res) {
        setConfirming(null);
        setMismatch({
          id,
          missingTeams: res.missingTeams,
          rematchedTeams: res.rematchedTeams,
          matchCount: res.matchCount,
          resultCount: res.resultCount,
        });
        return;
      }
      setConfirming(null);
      setMismatch(null);
      toast.success(`Restored — ${res.restored} fixtures put back.`);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteRestorePointAction(id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Restore point deleted.");
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Restore points
          </CardTitle>
          <CardDescription>
            Saved automatically before anything that deletes fixtures or
            results. Restoring saves the current state first, so you can undo
            the undo. Kept until the season is marked complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {points.length === 0 ? (
            <p className="text-ink-3 text-sm">
              None yet. One is saved the first time you regenerate a schedule or
              change a recorded score.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {points.map((p) => (
                <li
                  key={p.id}
                  className="border-rule flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-ink-3 text-xs">
                      {DateTime.fromISO(p.createdAt, {
                        zone: timezone,
                      }).toFormat("d LLL, HH:mm")}
                      {" · "}
                      {p.scope === "match"
                        ? "one match"
                        : `${p.matchCount} fixtures · ${p.resultCount} results`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setConfirming(p)}
                    >
                      <RotateCcw className="size-3.5" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Delete restore point: ${p.label}`}
                      onClick={() => remove(p.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirming !== null}
        onOpenChange={(o) => !o && !pending && setConfirming(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore this schedule?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The league&apos;s current fixtures and results are replaced
                  with{" "}
                  <strong className="text-ink">
                    {confirming?.matchCount} fixtures
                  </strong>{" "}
                  and{" "}
                  <strong className="text-ink">
                    {confirming?.resultCount} results
                  </strong>{" "}
                  from{" "}
                  {confirming
                    ? DateTime.fromISO(confirming.createdAt, {
                        zone: timezone,
                      }).toFormat("d LLL 'at' HH:mm")
                    : ""}
                  .
                </p>
                <p>
                  The current state is saved as a new restore point first, so
                  this is reversible.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirming && run(confirming.id, false)}
              disabled={pending}
            >
              {pending ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mismatch !== null}
        onOpenChange={(o) => !o && !pending && setMismatch(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="text-claret size-5 shrink-0" />
              The teams have changed
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                {mismatch && mismatch.missingTeams.length > 0 && (
                  <p>
                    <strong className="text-ink">
                      No longer in the league:
                    </strong>{" "}
                    {mismatch.missingTeams.join(", ")}. Their games cannot be
                    restored, so this snapshot can&apos;t be applied as it
                    stands — add the team back first if you want its games.
                  </p>
                )}
                {mismatch && mismatch.rematchedTeams.length > 0 && (
                  <p>
                    <strong className="text-ink">Matched by name:</strong>{" "}
                    {mismatch.rematchedTeams.join(", ")}. These were removed and
                    re-added since the snapshot, so their games will attach to
                    the new entries.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMismatch(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => mismatch && run(mismatch.id, true)}
              disabled={pending || (mismatch?.missingTeams.length ?? 0) > 0}
            >
              {pending ? "Restoring…" : "Restore anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
