"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateMultiDayConfigAction } from "@/server/actions/tournaments";
import type { TournamentDay } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Parse "1, 2 3" into a sorted, de-duped set of valid court numbers. */
function parseCourts(input: string, max: number): number[] {
  return Array.from(
    new Set(
      input
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= max),
    ),
  ).sort((a, b) => a - b);
}

export function MultiDaySetupCard({
  competitionId,
  startDate,
  endDate,
  window,
  gamesPerTeam,
  totalCourts,
  divisions,
  initialDays,
}: {
  competitionId: string;
  startDate: string | null;
  endDate: string | null;
  window: { startTime: string; endTime: string };
  gamesPerTeam: number;
  totalCourts: number;
  divisions: { id: string; name: string; courts: number[] | null }[];
  initialDays: TournamentDay[] | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [multiDay, setMultiDay] = useState((initialDays?.length ?? 0) >= 2);
  const [days, setDays] = useState<TournamentDay[]>(
    initialDays && initialDays.length > 0
      ? initialDays
      : [
          {
            date: startDate ?? "",
            startTime: window.startTime,
            endTime: window.endTime,
            targetGamesPerTeam: gamesPerTeam,
          },
          {
            date: endDate ?? startDate ?? "",
            startTime: window.startTime,
            endTime: window.endTime,
            targetGamesPerTeam: 0,
          },
        ],
  );
  const [courts, setCourts] = useState<Record<string, string>>(
    Object.fromEntries(
      divisions.map((d) => [d.id, (d.courts ?? []).join(", ")]),
    ),
  );

  const targetSum = days.reduce((n, d) => n + (d.targetGamesPerTeam || 0), 0);

  const updateDay = (i: number, patch: Partial<TournamentDay>) =>
    setDays((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const addDay = () =>
    setDays((ds) => [
      ...ds,
      {
        date: endDate ?? "",
        startTime: window.startTime,
        endTime: window.endTime,
        targetGamesPerTeam: 0,
      },
    ]);
  const removeDay = (i: number) =>
    setDays((ds) => ds.filter((_, k) => k !== i));

  function save() {
    start(async () => {
      const divisionCourts = divisions.map((d) => {
        const parsed = parseCourts(courts[d.id] ?? "", totalCourts);
        return { divisionId: d.id, courts: parsed.length > 0 ? parsed : null };
      });
      const res = await updateMultiDayConfigAction(competitionId, {
        days: multiDay ? days : [],
        divisionCourts,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Multi-day setup saved — redraw pools to apply.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={multiDay}
            onChange={(e) => setMultiDay(e.target.checked)}
          />
          Run this tournament over multiple days
        </label>

        {multiDay && (
          <div className="space-y-2">
            {days.map((d, i) => (
              <div
                key={i}
                className="border-border bg-surface grid gap-2 rounded-md border p-3 sm:grid-cols-[auto_1.4fr_1fr_1fr_1fr_auto] sm:items-end"
              >
                <span className="font-display self-center text-sm font-semibold">
                  Day {i + 1}
                </span>
                <DayField label="Date">
                  <Input
                    type="date"
                    value={d.date}
                    onChange={(e) => updateDay(i, { date: e.target.value })}
                  />
                </DayField>
                <DayField label="Start">
                  <Input
                    type="time"
                    value={d.startTime}
                    onChange={(e) =>
                      updateDay(i, { startTime: e.target.value })
                    }
                  />
                </DayField>
                <DayField label="End">
                  <Input
                    type="time"
                    value={d.endTime}
                    onChange={(e) => updateDay(i, { endTime: e.target.value })}
                  />
                </DayField>
                <DayField label="Games/team">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={d.targetGamesPerTeam}
                    onChange={(e) =>
                      updateDay(i, {
                        targetGamesPerTeam: Number(e.target.value) || 0,
                      })
                    }
                  />
                </DayField>
                {days.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDay(i)}
                    aria-label={`Remove day ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDay}
              >
                <Plus className="size-4" /> Add day
              </Button>
              <span className="text-muted-foreground text-xs">
                Targets total {targetSum} of {gamesPerTeam} games/team
                {targetSum === gamesPerTeam
                  ? "."
                  : " — the last day absorbs any remainder."}
              </span>
            </div>
          </div>
        )}
      </div>

      {divisions.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-sm font-semibold">Division courts</p>
          <p className="text-muted-foreground text-xs">
            Courts each division plays on (e.g. “1, 2”). Leave blank to share
            all {totalCourts} courts — each division always stays blocked
            together.
          </p>
          {divisions.map((d) => (
            <div
              key={d.id}
              className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center"
            >
              <Label className="text-sm">{d.name}</Label>
              <Input
                placeholder={`Shared (1–${totalCourts})`}
                value={courts[d.id] ?? ""}
                onChange={(e) =>
                  setCourts((c) => ({ ...c, [d.id]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      <Button type="button" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save multi-day setup"}
      </Button>
    </div>
  );
}

function DayField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}
