"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

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
          </div>

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
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
