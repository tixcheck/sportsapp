"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Settings } from "lucide-react";
import { toast } from "sonner";

import { updateReversePairsSettingsAction } from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Everything about the event that isn't the draw.
 *
 * One form rather than several cards, because an organizer changing the venue
 * and opening sign-ups is doing one thing, and separate saves turn that into
 * two writes that can half-fail.
 */
export function ReversePairsSettingsCard({
  competitionId,
  timezone,
  pairCount,
  initial,
}: {
  competitionId: string;
  timezone: string;
  pairCount: number;
  initial: {
    name: string;
    date: string;
    venue: string;
    courts: number;
    minutesPerGame: number;
    pointsPerGame: number;
    registrationOpen: boolean;
    /** ISO instant, or null. */
    registrationDeadline: string | null;
    maxPairs: number | null;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // The deadline is stored as an instant and edited as a wall clock. Converting
  // in the event's own zone is what makes "6pm" mean 6pm at the gym.
  const [v, setV] = useState({
    ...initial,
    registrationDeadline: initial.registrationDeadline
      ? DateTime.fromISO(initial.registrationDeadline, {
          zone: timezone,
        }).toFormat("yyyy-MM-dd'T'HH:mm")
      : "",
  });
  const set = (patch: Partial<typeof v>) =>
    setV((prev) => ({ ...prev, ...patch }));

  const needed = v.courts * 6;
  const capBelowCourts = v.maxPairs !== null && v.maxPairs < needed;

  function save() {
    start(async () => {
      const res = await updateReversePairsSettingsAction({
        competitionId,
        name: v.name,
        date: v.date,
        venue: v.venue,
        courts: Number(v.courts),
        minutesPerGame: Number(v.minutesPerGame),
        pointsPerGame: Number(v.pointsPerGame),
        registrationOpen: v.registrationOpen,
        registrationDeadline: v.registrationDeadline,
        maxPairs: v.maxPairs === null ? null : Number(v.maxPairs),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="size-4" />
          Event settings
        </CardTitle>
        <CardDescription>
          The day, the courts, and whether pairs can sign themselves up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rps-name">Name</Label>
            <Input
              id="rps-name"
              value={v.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rps-date">Date</Label>
            <Input
              id="rps-date"
              type="date"
              value={v.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="rps-venue">Venue</Label>
          <Input
            id="rps-venue"
            value={v.venue}
            placeholder="Optional"
            onChange={(e) => set({ venue: e.target.value })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rps-courts">Courts</Label>
            <Input
              id="rps-courts"
              type="number"
              min={1}
              max={12}
              value={v.courts}
              onChange={(e) => set({ courts: Number(e.target.value) || 1 })}
            />
            <p className="text-ink-3 text-xs">{needed} pairs on court.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rps-points">Points per game</Label>
            <Input
              id="rps-points"
              type="number"
              min={5}
              max={99}
              value={v.pointsPerGame}
              onChange={(e) =>
                set({ pointsPerGame: Number(e.target.value) || 25 })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rps-minutes">Minutes per game</Label>
            <Input
              id="rps-minutes"
              type="number"
              min={5}
              max={120}
              value={v.minutesPerGame}
              onChange={(e) =>
                set({ minutesPerGame: Number(e.target.value) || 15 })
              }
            />
          </div>
        </div>

        <div className="border-rule space-y-3 rounded-lg border p-3">
          <button
            type="button"
            onClick={() => set({ registrationOpen: !v.registrationOpen })}
            className="flex w-full items-start gap-2 text-left"
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                v.registrationOpen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {v.registrationOpen && <span className="text-xs">✓</span>}
            </span>
            <span className="text-sm">
              <span className="font-medium">Let pairs sign themselves up.</span>{" "}
              <span className="text-muted-foreground">
                A sign-up form appears on the public page. The event has to be
                published for anyone to reach it.
              </span>
            </span>
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rps-deadline">Deadline</Label>
              <Input
                id="rps-deadline"
                type="datetime-local"
                value={v.registrationDeadline}
                onChange={(e) => set({ registrationDeadline: e.target.value })}
              />
              <p className="text-ink-3 text-xs">
                Blank for none. Local time at the venue.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rps-max">Maximum pairs</Label>
              <Input
                id="rps-max"
                type="number"
                min={2}
                max={200}
                placeholder="No limit"
                value={v.maxPairs ?? ""}
                onChange={(e) =>
                  set({
                    maxPairs:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <p className="text-ink-3 text-xs">
                {pairCount} registered so far.
              </p>
            </div>
          </div>

          {capBelowCourts && (
            <p className="text-claret text-sm">
              {v.courts} court{v.courts === 1 ? "" : "s"} needs {needed} pairs
              to fill, but the cap is {v.maxPairs}. Nobody would be able to draw
              a schedule.
            </p>
          )}
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
