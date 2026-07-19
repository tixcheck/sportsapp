"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import type { LeagueCourt } from "@/lib/db/schema";

import { updateLeagueSettingsAction } from "@/server/actions/leagues";
import {
  editLeagueSchema,
  DAY_LABELS,
  type EditLeagueInput,
} from "@/lib/validations/league";
import { FORMAT_PRESETS, type Sport } from "@/lib/formats";
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

const selectClass =
  "border-border bg-surface h-9 w-full rounded-md border px-2 text-sm";

export function EditLeagueSettingsDialog({
  competitionId,
  sport,
  hasScores,
  initial,
}: {
  competitionId: string;
  sport: Sport;
  /** Scores recorded → the match format + 2-set choice are locked. */
  hasScores: boolean;
  initial: EditLeagueInput;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [blackoutText, setBlackoutText] = useState(
    initial.blackoutDates.join(", "),
  );
  const [courts, setCourtsState] = useState<LeagueCourt[]>(
    initial.courtList ?? [],
  );
  const [rangeText, setRangeText] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<EditLeagueInput>({
    resolver: zodResolver(editLeagueSchema),
    defaultValues: initial,
  });

  // Keep the form's courtList in sync with the editor (null when empty = default).
  function setCourts(next: LeagueCourt[]) {
    setCourtsState(next);
    setValue("courtList", next.length ? next : null);
  }
  function addRange(raw: string) {
    // "9-12, 14, 16-18" → individual court labels.
    const labels: string[] = [];
    for (const part of raw.split(/[,\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d+)-(\d+)$/);
      if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])];
        for (let n = Math.min(a, b); n <= Math.max(a, b); n++) {
          labels.push(String(n));
        }
      } else {
        labels.push(part);
      }
    }
    const existing = new Set(courts.map((c) => c.label));
    const added = labels
      .filter((l) => !existing.has(l))
      .map((label) => ({ label, prime: false }));
    if (added.length) setCourts([...courts, ...added]);
  }

  function parseBlackouts(raw: string) {
    setBlackoutText(raw);
    setValue(
      "blackoutDates",
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
    );
  }

  function onSubmit(values: EditLeagueInput) {
    start(async () => {
      const res = await updateLeagueSettingsAction(competitionId, values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          reset(initial);
          setBlackoutText(initial.blackoutDates.join(", "));
          setCourtsState(initial.courtList ?? []);
          setRangeText("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil />
          Edit settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit league settings</DialogTitle>
          <DialogDescription>
            Update the details, weekly slot, courts, rounds, and format.
            Schedule changes (slot, courts, rounds, blackouts) take effect the
            next time you generate the schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Field label="Name" error={errors.name?.message}>
            <Input {...register("name")} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" error={errors.startDate?.message}>
              <Input type="date" {...register("startDate")} />
            </Field>
            <Field label="End date" error={errors.endDate?.message}>
              <Input type="date" {...register("endDate")} />
            </Field>
          </div>

          <Field label="Venue" error={errors.venue?.message}>
            <Input {...register("venue")} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Match day" error={errors.slotDayOfWeek?.message}>
              <select
                className={selectClass}
                {...register("slotDayOfWeek", { valueAsNumber: true })}
              >
                {DAY_LABELS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start time" error={errors.slotStartTime?.message}>
              <Input type="time" {...register("slotStartTime")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Courts" error={errors.courts?.message}>
              <Input
                type="number"
                min={1}
                max={20}
                {...register("courts", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Round-robin" error={errors.roundsPerTeam?.message}>
              <select
                className={selectClass}
                {...register("roundsPerTeam", { valueAsNumber: true })}
              >
                <option value={1}>Single (play each team once)</option>
                <option value={2}>Double (play each team twice)</option>
              </select>
            </Field>
            <Field
              label="Games per team"
              error={errors.gamesPerTeam?.message}
              hint="Blank = full round robin. A number caps each team at that many different opponents (partial round robin)."
            >
              <Input
                type="number"
                min={1}
                placeholder="All"
                {...register("gamesPerTeam", {
                  setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                })}
              />
            </Field>
            <Field
              label="Games per week"
              error={errors.gamesPerWeek?.message}
              hint="Games each team plays per night. 2 packs two games onto the same Tuesday (staggered), so a 12-game season runs 6 weeks instead of 12."
            >
              <Input
                type="number"
                min={1}
                max={7}
                {...register("gamesPerWeek", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Minutes per game"
              error={errors.minutesPerGame?.message}
              hint="How long each game runs — spaces a night's games apart (e.g. 45 = 6:30 then 7:15). Regenerate the schedule to apply."
            >
              <Input
                type="number"
                min={15}
                max={180}
                step={5}
                {...register("minutesPerGame", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <Field
            label="Custom courts (optional)"
            hint="Name the exact courts you play on and flag the prime ones. Prime-court games are shared evenly across teams. Leave empty to number courts 1–N."
          >
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 9-12, 14, 16-18"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRange(rangeText);
                    setRangeText("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  addRange(rangeText);
                  setRangeText("");
                }}
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
            {courts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {courts.map((c, i) => (
                  <div
                    key={`${c.label}-${i}`}
                    className="border-border bg-surface flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                  >
                    <span className="font-medium tabular-nums">{c.label}</span>
                    <label className="text-muted-foreground flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={c.prime}
                        onChange={(e) =>
                          setCourts(
                            courts.map((x, k) =>
                              k === i ? { ...x, prime: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      Prime
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove court ${c.label}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setCourts(courts.filter((_, k) => k !== i))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Field>

          <Field label="Blackout dates" error={errors.blackoutDates?.message}>
            <Input
              placeholder="2025-08-04, 2025-09-01"
              value={blackoutText}
              onChange={(e) => parseBlackouts(e.target.value)}
            />
          </Field>

          <Field label="Match format" error={errors.formatId?.message}>
            <select
              className={selectClass}
              disabled={hasScores}
              {...register("formatId")}
            >
              {FORMAT_PRESETS[sport].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Standings tiebreaker"
            error={errors.tiebreaker?.message}
            hint="How teams tied on match wins are separated."
          >
            <select className={selectClass} {...register("tiebreaker")}>
              <option value="ova">
                OVA — match wins → head-to-head → set ratio → point ratio
              </option>
              <option value="differential">
                Point differential — match wins → head-to-head → PF − PA
              </option>
            </select>
          </Field>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              {...register("projectShortTeams")}
            />
            <span>
              Project short-handed teams to the full game count for ranking
              <span className="text-muted-foreground block text-xs">
                Teams that joined mid-season and have played fewer games are
                ranked on their pace over a full slate (their actual W–L still
                shows, marked with *). Existing teams are unaffected.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={hasScores}
              {...register("twoSetRoundRobin")}
            />
            Games are 2 sets (can tie 1–1) instead of best-of-3
          </label>

          {hasScores && (
            <p className="text-ink-2 flex items-start gap-1.5 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Scores have been entered, so the match format is locked — changing
              it could invalidate recorded results. Everything else is editable.
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
