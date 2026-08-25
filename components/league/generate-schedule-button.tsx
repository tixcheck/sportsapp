"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { generateLeagueScheduleAction } from "@/server/actions/leagues";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Generate, or regenerate, a league schedule.
 *
 * Regenerating deletes every match, and `sets` cascade off `matches` — so on a
 * season in progress this button destroys the entire record of who beat whom.
 * The server now refuses that outright and returns the count instead; this
 * dialog is where the organizer is told the number, in those words, before
 * anything is deleted.
 *
 * The confirm is deliberately not the default-styled button and does not say
 * "OK": a season that took three months to play should not be one reflexive
 * click from gone.
 */
export function GenerateScheduleButton({
  competitionId,
  hasSchedule,
}: {
  competitionId: string;
  hasSchedule: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [played, setPlayed] = useState<number | null>(null);

  function run(replacePlayed: boolean) {
    startTransition(async () => {
      const result = await generateLeagueScheduleAction(competitionId, {
        replacePlayed,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if ("needsConfirmation" in result) {
        setPlayed(result.played);
        return;
      }

      setPlayed(null);
      toast.success(`Schedule generated — ${result.matchCount} matches.`);
      router.refresh();
    });
  }

  const n = played ?? 0;

  return (
    <>
      <Button
        onClick={() => run(false)}
        disabled={pending}
        variant={hasSchedule ? "outline" : "default"}
      >
        <CalendarPlus />
        {pending
          ? "Generating…"
          : hasSchedule
            ? "Regenerate schedule"
            : "Generate schedule"}
      </Button>

      <Dialog
        open={played !== null}
        onOpenChange={(open) => !open && !pending && setPlayed(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="text-claret size-5 shrink-0" />
              This erases {n} played {n === 1 ? "match" : "matches"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Regenerating draws a new schedule from scratch. Every score,
                  set and result already recorded in this league is deleted with
                  the old fixtures, and the standings reset to zero.
                </p>
                <p className="text-ink font-semibold">
                  This cannot be undone from inside the app.
                </p>
                <p>
                  If you only need to add a team, drop one, or move a game,
                  close this and use the mid-season tools instead — those keep
                  your results.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPlayed(null)}
              disabled={pending}
            >
              Keep my scores
            </Button>
            <Button
              variant="destructive"
              onClick={() => run(true)}
              disabled={pending}
            >
              {pending
                ? "Deleting…"
                : `Delete ${n} ${n === 1 ? "result" : "results"} and regenerate`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
