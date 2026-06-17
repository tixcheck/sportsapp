"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Pencil, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { rescheduleMatchAction } from "@/server/actions/matches";
import { detectConflicts } from "@/lib/scheduler/conflicts";
import type { ScheduleMatch } from "@/lib/queries/leagues";
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

function toLocalInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  return DateTime.fromISO(iso, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function RescheduleDialog({
  match,
  allMatches,
  timezone,
}: {
  match: ScheduleMatch;
  allMatches: ScheduleMatch[];
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(() =>
    toLocalInput(match.scheduledAt, timezone),
  );
  const [court, setCourt] = useState(match.court ?? "");

  const newIso = useMemo(() => {
    if (!local) return null;
    const dt = DateTime.fromISO(local, { zone: timezone });
    return dt.isValid ? dt.toISO() : null;
  }, [local, timezone]);

  const conflicts = useMemo(() => {
    if (!newIso) return [];
    const byId = new Map(allMatches.map((m) => [m.id, m]));
    return detectConflicts(match, newIso, court, allMatches).map((c) => {
      const m = byId.get(c.matchId)!;
      const label = `${m.homeTeamName} vs ${m.awayTeamName}`;
      return c.type === "court"
        ? `${court} is already hosting ${label}.`
        : `A team is already playing ${label} at this time.`;
    });
  }, [newIso, court, allMatches, match]);

  const hasConflicts = conflicts.length > 0;

  function save() {
    if (!newIso || !court) {
      toast.error("Pick a date/time and a court.");
      return;
    }
    startTransition(async () => {
      const result = await rescheduleMatchAction(
        match.id,
        newIso,
        court,
        hasConflicts,
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if ("conflicts" in result) {
        toast.error("Resolve the conflicts or save anyway.");
        return;
      }
      toast.success("Match rescheduled.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule match</DialogTitle>
          <DialogDescription>
            {match.homeTeamName} vs {match.awayTeamName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="when">Date &amp; time</Label>
            <Input
              id="when"
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="court">Court</Label>
            <Input
              id="court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="Court 1"
            />
          </div>

          {hasConflicts && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" />
                Scheduling conflict
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {conflicts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
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
            onClick={save}
            disabled={pending}
            variant={hasConflicts ? "destructive" : "default"}
          >
            {pending
              ? "Saving…"
              : hasConflicts
                ? "Save anyway"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
