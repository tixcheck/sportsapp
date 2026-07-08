"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { updateTournamentSettingsAction } from "@/server/actions/tournaments";
import {
  editTournamentSchema,
  type EditTournamentInput,
} from "@/lib/validations/tournament";
import { FORMAT_PRESETS, type Sport } from "@/lib/formats";
import { TOURNAMENT_FORMATS } from "@/lib/tournament-formats";
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

export function EditTournamentSettingsDialog({
  competitionId,
  sport,
  hasScores,
  initial,
}: {
  competitionId: string;
  sport: Sport;
  /** Scores recorded → the match format + 2-set choice are locked. */
  hasScores: boolean;
  initial: EditTournamentInput;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditTournamentInput>({
    resolver: zodResolver(editTournamentSchema),
    defaultValues: initial,
  });

  function onSubmit(values: EditTournamentInput) {
    start(async () => {
      const res = await updateTournamentSettingsAction(competitionId, values);
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
        if (o) reset(initial); // re-sync to latest when reopening
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
          <DialogTitle>Edit tournament settings</DialogTitle>
          <DialogDescription>
            Update the details, schedule window, courts, and format. Structure
            changes (courts, pool size, bracket type) take effect the next time
            you draw pools or generate the bracket.
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
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start time" error={errors.startTime?.message}>
              <Input type="time" {...register("startTime")} />
            </Field>
            <Field label="End time" error={errors.endTime?.message}>
              <Input type="time" {...register("endTime")} />
            </Field>
          </div>

          <Field label="Venue" error={errors.venue?.message}>
            <Input {...register("venue")} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Courts" error={errors.courts?.message}>
              <Input
                type="number"
                min={1}
                max={40}
                {...register("courts", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Games per team" error={errors.gamesPerTeam?.message}>
              <Input
                type="number"
                min={1}
                max={12}
                {...register("gamesPerTeam", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Minutes per game"
              error={errors.minutesPerGame?.message}
            >
              <Input
                type="number"
                min={5}
                max={120}
                placeholder="Auto"
                {...register("minutesPerGame", {
                  setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                })}
              />
            </Field>
          </div>

          <Field label="Bracket type" error={errors.formatTemplate?.message}>
            <select className={selectClass} {...register("formatTemplate")}>
              {TOURNAMENT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Playoff teams" error={errors.playoffTeams?.message}>
            <Input
              type="number"
              min={2}
              max={64}
              placeholder="Decide later"
              {...register("playoffTeams", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Drives the generic bracket preview on the public page.
            </p>
          </Field>

          <Field label="Pool format" error={errors.formatId?.message}>
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

          <Field label="Bracket format" error={errors.bracketFormatId?.message}>
            <select
              className={selectClass}
              disabled={hasScores}
              {...register("bracketFormatId")}
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
            Pool games are 2 sets (can tie 1–1) instead of the pool format as-is
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
