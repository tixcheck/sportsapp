"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { toast } from "sonner";

import { retimePoolScheduleAction } from "@/server/actions/pools";
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
 * Re-space the pool schedule to a new per-game length, in place — keeps the
 * matchups, courts, refs, scores, and the first game's start; only the gap
 * between games changes.
 */
export function RetimeScheduleDialog({
  competitionId,
  currentMinutes,
}: {
  competitionId: string;
  /** The current game length (null = it was auto-estimated). */
  currentMinutes: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [minutes, setMinutes] = useState(String(currentMinutes ?? 20));

  function save() {
    const n = Number(minutes);
    start(async () => {
      const res = await retimePoolScheduleAction(competitionId, n);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Schedule re-timed — ${n} min per game across ${res.waves} wave${
          res.waves === 1 ? "" : "s"
        }.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Clock />
          Game length
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set game length</DialogTitle>
          <DialogDescription>
            Re-spaces every pool game&apos;s start time to this many minutes
            apart. Matchups, courts, and scores stay put; the first game keeps
            its start time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="minutes">Minutes per game</Label>
          <Input
            id="minutes"
            type="number"
            min={5}
            max={120}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-32 tabular-nums"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={save} disabled={pending}>
            {pending ? "Re-timing…" : "Re-time schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
