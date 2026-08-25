"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { generateLeagueScheduleAction } from "@/server/actions/leagues";
import {
  previewRedrawRemainingAction,
  redrawRemainingAction,
} from "@/server/actions/mid-season";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Blocked = { played: number; name: string };

/**
 * Generate a schedule, or change one that already exists.
 *
 * Once a league has results, "regenerate" splits into two very different
 * operations and this dialog is where they stop looking alike:
 *
 *   Redraw remaining weeks  — played games frozen, only future weeks re-planned
 *   Start over completely   — deletes every match, and scores cascade with them
 *
 * The first is what an organizer almost always wants and is the default. The
 * second is gated behind typing the league name, the same lock as deleting a
 * competition, because it destroys the same data.
 */
export function GenerateScheduleButton({
  competitionId,
  hasSchedule,
}: {
  competitionId: string;
  hasSchedule: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [redraw, setRedraw] = useState<{
    created: number;
    replacing: number;
    playedFrozen: number;
  } | null>(null);

  // Preview the safe option as soon as the dialog opens, so the counts the
  // organizer is choosing between are real rather than promised.
  useEffect(() => {
    if (!blocked) return;
    let live = true;
    previewRedrawRemainingAction(competitionId).then((r) => {
      if (!live || "error" in r) return;
      setRedraw({
        created: r.created,
        replacing: r.replacing,
        playedFrozen: r.playedFrozen,
      });
    });
    return () => {
      live = false;
    };
  }, [blocked, competitionId]);

  function close() {
    setBlocked(null);
    setConfirmName("");
    setRedraw(null);
  }

  function generate(confirm?: string) {
    start(async () => {
      const result = await generateLeagueScheduleAction(competitionId, {
        confirmName: confirm,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if ("needsConfirmation" in result) {
        setBlocked({ played: result.played, name: result.name });
        return;
      }
      close();
      toast.success(`Schedule generated — ${result.matchCount} matches.`);
      router.refresh();
    });
  }

  function runRedraw() {
    start(async () => {
      const result = await redrawRemainingAction(competitionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      close();
      toast.success(
        `Remaining weeks redrawn — ${result.created} games replaced ${result.replaced}.`,
      );
      router.refresh();
    });
  }

  const armed =
    blocked !== null && confirmName.trim() === blocked.name.trim() && !pending;

  return (
    <>
      <Button
        onClick={() => generate()}
        disabled={pending}
        variant={hasSchedule ? "outline" : "default"}
      >
        <CalendarPlus />
        {pending
          ? "Working…"
          : hasSchedule
            ? "Regenerate schedule"
            : "Generate schedule"}
      </Button>

      <Dialog
        open={blocked !== null}
        onOpenChange={(o) => !o && !pending && close()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              This league has {blocked?.played} played{" "}
              {blocked?.played === 1 ? "match" : "matches"}
            </DialogTitle>
            <DialogDescription>Choose what happens to them.</DialogDescription>
          </DialogHeader>

          <div className="border-rule bg-paper-raised flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="text-pine size-4 shrink-0" />
              <h3 className="font-semibold">Redraw the remaining weeks</h3>
            </div>
            <p className="text-ink-2 text-sm">
              {redraw
                ? `Keeps all ${redraw.playedFrozen} played games exactly as they are, and replaces the ${redraw.replacing} upcoming ones with ${redraw.created} newly drawn games. No team is paired with an opponent it has already played.`
                : "Keeps every played game and re-plans only the weeks nobody has played yet."}
            </p>
            <Button
              onClick={runRedraw}
              disabled={pending || redraw?.created === 0}
              className="mt-1 self-start"
            >
              {pending ? "Working…" : "Redraw remaining weeks"}
            </Button>
          </div>

          <div className="border-rule flex flex-col gap-2 rounded-lg border border-dashed p-4">
            <div className="flex items-center gap-2">
              <TriangleAlert className="text-claret size-4 shrink-0" />
              <h3 className="font-semibold">Start the season over</h3>
            </div>
            <p className="text-ink-2 text-sm">
              Deletes all {blocked?.played} results and every fixture, and
              resets the standings to zero.{" "}
              <span className="text-ink font-semibold">
                This cannot be undone from inside the app.
              </span>{" "}
              Type{" "}
              <span className="text-ink font-semibold">{blocked?.name}</span> to
              unlock it.
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={blocked?.name}
              aria-label={`Type ${blocked?.name} to confirm erasing all results`}
              className="mt-1"
            />
            <Button
              variant="destructive"
              onClick={() => generate(confirmName)}
              disabled={!armed}
              className="self-start"
            >
              {pending ? "Working…" : "Erase everything and start over"}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
