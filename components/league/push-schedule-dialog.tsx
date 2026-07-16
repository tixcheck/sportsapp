"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  previewScheduleShiftAction,
  shiftScheduleAction,
  type ShiftPreview,
} from "@/server/actions/matches";
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

const WEEK_OPTIONS = [1, 2, 3, 4];

function fmt(iso: string, tz: string): string {
  const d = DateTime.fromISO(iso, { zone: tz });
  return d.isValid ? d.toFormat("ccc, LLL d · h:mm a") : "—";
}

function fmtDate(date: string, tz: string): string {
  const d = DateTime.fromISO(date, { zone: tz });
  return d.isValid ? d.toFormat("ccc, LLL d") : date;
}

/**
 * Push a league's remaining schedule back by whole weeks — the "rained out /
 * bad air quality, skip this week" button. Always previews before it writes:
 * this moves every unplayed game at once.
 */
export function PushScheduleDialog({
  competitionId,
  timezone,
}: {
  competitionId: string;
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [loading, startPreview] = useTransition();

  const [fromDate, setFromDate] = useState(() =>
    DateTime.now().setZone(timezone).toISODate(),
  );
  const [weeks, setWeeks] = useState(1);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ShiftPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !fromDate) return;
    startPreview(async () => {
      const result = await previewScheduleShiftAction({
        competitionId,
        fromDate,
        weeks,
      });
      if ("error" in result) {
        setPreview(null);
        setPreviewError(result.error);
        return;
      }
      setPreviewError(null);
      setPreview(result);
    });
  }, [open, fromDate, weeks, competitionId]);

  function apply() {
    startTransition(async () => {
      const result = await shiftScheduleAction({
        competitionId,
        fromDate: fromDate!,
        weeks,
        reason: reason.trim() || undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Moved ${result.moved} game${result.moved === 1 ? "" : "s"} back ${weeks} week${weeks === 1 ? "" : "s"}.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  const nothingToMove = preview !== null && preview.moving === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock className="size-4" />
          Push schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Push the schedule back</DialogTitle>
          <DialogDescription>
            Moves every game that hasn&apos;t been played yet. Results already
            recorded stay put.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="from">Skip games from</Label>
            <Input
              id="from"
              type="date"
              value={fromDate ?? ""}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Push back by</Label>
            <div className="flex flex-wrap gap-2">
              {WEEK_OPTIONS.map((w) => (
                <Button
                  key={w}
                  type="button"
                  size="sm"
                  variant={weeks === w ? "default" : "outline"}
                  onClick={() => setWeeks(w)}
                >
                  {w} week{w === 1 ? "" : "s"}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Poor air quality"
              maxLength={200}
            />
            <p className="text-muted-foreground text-xs">
              Included in the email each player gets.
            </p>
          </div>

          {loading && (
            <p className="text-muted-foreground text-sm">Checking…</p>
          )}

          {previewError && (
            <p className="text-destructive text-sm">{previewError}</p>
          )}

          {preview && !loading && (
            <div className="bg-muted/50 grid gap-2 rounded-md border p-3 text-sm">
              <p className="font-medium">
                {preview.moving} game{preview.moving === 1 ? "" : "s"} will move
              </p>
              {preview.alreadyPlayed > 0 && (
                <p className="text-muted-foreground">
                  {preview.alreadyPlayed} already played — staying put.
                </p>
              )}
              {preview.noTime > 0 && (
                <p className="text-muted-foreground">
                  {preview.noTime} with no time set — unchanged.
                </p>
              )}
              {preview.vacatedDates.length > 0 && (
                <p className="text-muted-foreground">
                  No games:{" "}
                  {preview.vacatedDates
                    .map((d) => fmtDate(d, timezone))
                    .join(", ")}
                </p>
              )}
              {preview.newEndDate && (
                <p className="text-muted-foreground">
                  Season now ends {fmtDate(preview.newEndDate, timezone)}.
                </p>
              )}

              {preview.sample.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {preview.sample.map((s, i) => (
                    <li key={i} className="text-muted-foreground text-xs">
                      <span className="text-foreground">{s.label}</span>:{" "}
                      {fmt(s.from, timezone)} → {fmt(s.to, timezone)}
                    </li>
                  ))}
                  {preview.moving > preview.sample.length && (
                    <li className="text-muted-foreground text-xs">
                      …and {preview.moving - preview.sample.length} more.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {preview && preview.warnings.length > 0 && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" />
                {preview.warnings.length} warning
                {preview.warnings.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {preview.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w.detail}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs">
                You can push anyway and fix these individually after.
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
            disabled={pending || loading || nothingToMove || !preview}
            variant={preview?.warnings.length ? "destructive" : "default"}
          >
            {pending
              ? "Pushing…"
              : preview?.warnings.length
                ? "Push anyway"
                : "Push schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
