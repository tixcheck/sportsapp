"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { UserPlus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  previewAddTeamsMidSeasonAction,
  addTeamsMidSeasonAction,
  type MidSeasonPreview,
} from "@/server/actions/mid-season";
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
import { Label } from "@/components/ui/label";

function fmtDate(date: string, tz: string): string {
  const d = DateTime.fromISO(date, { zone: tz });
  return d.isValid ? d.toFormat("ccc, LLL d") : date;
}

/**
 * Add newly-registered pairs to a league that's already underway. Regenerates
 * only the unplayed weeks — played games stay frozen — and always previews
 * before writing. Mode A gives the new pairs the games the remaining weeks fit;
 * mode B tops them up to the league target with catch-up games.
 */
export function AddTeamsMidSeasonDialog({
  competitionId,
  timezone,
}: {
  competitionId: string;
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"A" | "B">("A");
  const [pending, startTransition] = useTransition();
  const [loading, startPreview] = useTransition();
  const [preview, setPreview] = useState<MidSeasonPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    startPreview(async () => {
      const result = await previewAddTeamsMidSeasonAction({
        competitionId,
        mode,
      });
      if ("error" in result) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setError(null);
      setPreview(result);
    });
  }, [open, mode, competitionId]);

  function apply() {
    startTransition(async () => {
      const result = await addTeamsMidSeasonAction({ competitionId, mode });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Scheduled ${result.created} games for the new teams. Played games untouched.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="size-4" />
          Add teams mid-season
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add teams mid-season</DialogTitle>
          <DialogDescription>
            Regenerates only the unplayed weeks. Every game already played stays
            exactly as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>How many games should the new pairs get?</Label>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant={mode === "A" ? "default" : "outline"}
                className="h-auto flex-col items-start gap-0.5 py-2 text-left"
                onClick={() => setMode("A")}
              >
                <span className="font-medium">
                  As many as the remaining weeks fit
                </span>
                <span className="text-xs font-normal opacity-80">
                  Simplest — everyone plays the normal weekly cadence.
                </span>
              </Button>
              <Button
                type="button"
                variant={mode === "B" ? "default" : "outline"}
                className="h-auto flex-col items-start gap-0.5 py-2 text-left"
                onClick={() => setMode("B")}
              >
                <span className="font-medium">
                  Catch them up to the league target
                </span>
                <span className="text-xs font-normal opacity-80">
                  Adds doubleheaders between the new pairs to reach full games.
                </span>
              </Button>
            </div>
          </div>

          {loading && (
            <p className="text-muted-foreground text-sm">Checking…</p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}

          {preview && !loading && (
            <div className="bg-muted/50 grid gap-2 rounded-md border p-3 text-sm">
              <p className="font-medium">
                Adding {preview.newTeamNames.join(", ")}
              </p>
              <p className="text-muted-foreground">
                {preview.created} new games created, replacing{" "}
                {preview.replacing} unplayed ones.{" "}
                <span className="text-foreground">
                  {preview.playedFrozen} played games untouched.
                </span>
              </p>
              {preview.makeups > 0 && (
                <p className="text-muted-foreground">
                  Includes {preview.makeups} catch-up doubleheader
                  {preview.makeups === 1 ? "" : "s"} between the new pairs.
                </p>
              )}

              <ul className="mt-1 grid gap-0.5">
                {preview.finalGames.map((t) => (
                  <li
                    key={t.teamName}
                    className="flex justify-between gap-4 text-xs"
                  >
                    <span
                      className={
                        t.isNew
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {t.teamName}
                      {t.isNew ? " (new)" : ""}
                    </span>
                    <span className="tabular-nums">{t.games} games</span>
                  </li>
                ))}
              </ul>

              {preview.sample.length > 0 && (
                <div className="mt-1">
                  <p className="text-muted-foreground text-xs">First games:</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {preview.sample.map((s, i) => (
                      <li key={i} className="text-muted-foreground text-xs">
                        {s.label} · {fmtDate(s.weekDate, timezone)}
                        {s.makeup ? " · make-up" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {preview && preview.shortfalls.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" />
                Below the game target
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {preview.shortfalls.map((s) => (
                  <li key={s.teamName}>
                    {s.teamName}: {s.got} of {s.target} games — the remaining
                    weeks can&apos;t fit more at the normal rate.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview?.incomplete && (
            <p className="text-destructive text-sm">
              Couldn&apos;t place every game without a repeat — review the
              preview before applying.
            </p>
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
            disabled={pending || loading || !preview || preview.created === 0}
          >
            {pending ? "Scheduling…" : "Add & regenerate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
