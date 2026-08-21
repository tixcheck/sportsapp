"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { setLeagueRegistrationAction } from "@/server/actions/leagues";
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
 * Open/close public self-registration for a league and set an optional close
 * date. Separate from publishing: registration only reaches players once the
 * league is also published (public page live).
 */
export function LeagueRegistrationControls({
  competitionId,
  timezone,
  registrationOpen,
  registrationDeadline,
  published,
  waitlistClaimHours = 48,
}: {
  competitionId: string;
  timezone: string;
  registrationOpen: boolean;
  /** Hours to claim an offered waitlist spot. */
  waitlistClaimHours?: number;
  /** Stored close datetime (ISO), or null. */
  registrationDeadline: string | null;
  /** Whether the public page is live — drives the "not visible yet" hint. */
  published: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accept, setAccept] = useState(registrationOpen);
  const [pending, start] = useTransition();

  // The stored deadline is a timestamptz; show it as a plain date in the
  // league's timezone for editing.
  const initialDate = useMemo(
    () =>
      registrationDeadline
        ? DateTime.fromISO(registrationDeadline, { zone: timezone }).toFormat(
            "yyyy-MM-dd",
          )
        : "",
    [registrationDeadline, timezone],
  );
  const [deadline, setDeadline] = useState(initialDate);
  const [claimHours, setClaimHours] = useState(String(waitlistClaimHours));

  function reset() {
    setAccept(registrationOpen);
    setDeadline(initialDate);
  }

  function save() {
    start(async () => {
      const res = await setLeagueRegistrationAction({
        competitionId,
        open: accept,
        deadline: deadline || "",
        waitlistClaimHours: Math.min(
          336,
          Math.max(1, Number(claimHours) || 48),
        ),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        accept
          ? "Registration open — teams can sign up on the public page."
          : "Registration closed.",
      );
      setOpen(false);
      router.refresh();
    });
  }

  const label = registrationOpen ? "Registration: on" : "Registration";

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
          <UserPlus className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Team registration</DialogTitle>
          <DialogDescription>
            Let teams sign up themselves on the league&apos;s public page. This
            is separate from publishing — sign-ups only appear once the league
            is published too.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-1 size-4"
            />
            <span className="text-sm">
              <span className="font-medium">Accept team registrations</span>
              <span className="text-muted-foreground block">
                Teams pick their tier and add player emails; teammates are
                invited automatically.
              </span>
            </span>
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="reg-deadline">Close on (optional)</Label>
            <Input
              id="reg-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={!accept}
            />
            <p className="text-muted-foreground text-xs">
              Registration closes at the end of this day. Leave empty to keep it
              open until you close it.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reg-claim-hours">Waitlist claim window</Label>
            <div className="flex items-center gap-2">
              <Input
                id="reg-claim-hours"
                type="number"
                min={1}
                max={336}
                inputMode="numeric"
                className="max-w-24 tabular-nums"
                value={claimHours}
                onChange={(e) => setClaimHours(e.target.value)}
              />
              <span className="text-muted-foreground text-sm">hours</span>
            </div>
            <p className="text-muted-foreground text-xs">
              How long a waitlisted team has to claim a spot that comes free
              before it passes to the next team. The spot is held for them until
              then, so a long window keeps it empty.
            </p>
          </div>

          {accept && !published && (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
              This league isn&apos;t published yet, so players can&apos;t reach
              the sign-up form. Publish it to make registration live.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
