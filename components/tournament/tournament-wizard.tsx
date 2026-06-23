"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus, X } from "lucide-react";

import { createTournamentAction } from "@/server/actions/tournaments";
import {
  createTournamentSchema,
  type CreateTournamentInput,
} from "@/lib/validations/tournament";
import {
  FORMAT_PRESETS,
  SPORTS,
  defaultPoolPreset,
  type Sport,
} from "@/lib/formats";
import { TOURNAMENT_FORMATS } from "@/lib/tournament-formats";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScoringFields } from "@/components/scoring/scoring-fields";

const STEP_FIELDS: (keyof CreateTournamentInput)[][] = [
  ["sport"],
  [
    "name",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "venue",
    "courts",
    "gamesPerTeam",
  ],
  ["divisions"],
  ["formatTemplate"],
  ["formatId", "registrationDeadline"],
  [],
];
const STEP_TITLES = [
  "Sport",
  "Details",
  "Divisions",
  "Format",
  "Match format",
  "Scoring",
];

export function TournamentWizard({ orgId }: { orgId: string }) {
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateTournamentInput>({
    resolver: zodResolver(createTournamentSchema),
    defaultValues: {
      name: "",
      sport: "beach2",
      startDate: "",
      endDate: "",
      startTime: "09:00",
      endTime: "17:00",
      venue: "",
      courts: 4,
      gamesPerTeam: 3,
      formatId: defaultPoolPreset("beach2").id,
      formatTemplate: "single",
      twoSetRoundRobin: false,
      registrationDeadline: "",
      divisions: [{ name: "Open" }],
      allowCaptainEntry: false,
      allowRefEntry: false,
      allowOrganizerEntry: true,
      requireConfirmation: false,
    },
  });
  const {
    register,
    watch,
    setValue,
    trigger,
    handleSubmit,
    control,
    formState,
  } = form;
  const errors = formState.errors;
  const sport = watch("sport") as Sport;
  const divisions = useFieldArray({ control, name: "divisions" });

  async function next() {
    setFormError(null);
    if (await trigger(STEP_FIELDS[step])) {
      setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
    }
  }

  function onSubmit(values: CreateTournamentInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await createTournamentAction(orgId, values);
      if (result?.error) setFormError(result.error);
    });
  }

  return (
    <div>
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {STEP_TITLES.map((title, i) => (
          <li key={title} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-medium",
                i < step && "bg-primary text-primary-foreground",
                i === step && "bg-accent text-accent-foreground",
                i > step && "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={
                i === step
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }
            >
              {title}
            </span>
            {i < STEP_TITLES.length - 1 && (
              <span className="text-border mx-1">—</span>
            )}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {step === 0 && (
          <div className="grid gap-3">
            {SPORTS.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => {
                  setValue("sport", s.value);
                  setValue("formatId", defaultPoolPreset(s.value).id);
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-4 text-left transition-colors",
                  sport === s.value
                    ? "border-primary bg-accent"
                    : "border-border bg-surface hover:bg-muted",
                )}
              >
                <span>
                  <span className="font-display block font-semibold">
                    {s.label}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {s.roster}
                  </span>
                </span>
                {sport === s.value && <Check className="text-primary size-5" />}
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            <Field label="Tournament name" error={errors.name?.message}>
              <Input placeholder="Toronto Sand Classic" {...register("name")} />
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
            <p className="text-muted-foreground -mt-2 text-xs">
              The daily window shown to teams. The start time is also the
              default first-match time when you generate the schedule.
            </p>
            <Field label="Venue" error={errors.venue?.message}>
              <Input placeholder="Ashbridges Bay" {...register("venue")} />
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
              <Field
                label="Games per team"
                error={errors.gamesPerTeam?.message}
              >
                <Input
                  type="number"
                  min={1}
                  max={12}
                  {...register("gamesPerTeam", { valueAsNumber: true })}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3">
            <Label>Divisions</Label>
            <p className="text-muted-foreground -mt-1 text-sm">
              Teams register into a division (e.g. AA, A, BB). Pools are drawn
              within each division.
            </p>
            {divisions.fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <Input
                  placeholder={`Division ${i + 1}`}
                  {...register(`divisions.${i}.name` as const)}
                />
                {divisions.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => divisions.remove(i)}
                    aria-label="Remove division"
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {errors.divisions?.message && (
              <p className="text-destructive text-sm">
                {errors.divisions.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => divisions.append({ name: "" })}
            >
              <Plus />
              Add division
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-2">
            <Label>Tournament format</Label>
            <p className="text-muted-foreground -mt-1 text-sm">
              How the bracket runs after pool play. You can still set pools and
              the bracket up by hand later.
            </p>
            {TOURNAMENT_FORMATS.map((f) => {
              const selected = watch("formatTemplate") === f.id;
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => setValue("formatTemplate", f.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-surface hover:bg-muted",
                  )}
                >
                  <span className="font-display block font-semibold">
                    {f.label}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {f.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Match format</Label>
              {FORMAT_PRESETS[sport].map((p) => {
                const selected = watch("formatId") === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setValue("formatId", p.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-surface hover:bg-muted",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-1.5">
              <Label>Pool play</Label>
              <label className="text-muted-foreground flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-claret mt-0.5 size-4"
                  {...register("twoSetRoundRobin")}
                />
                <span>
                  Pool games are{" "}
                  <strong className="text-foreground">2 sets</strong> (can end
                  1–1, a tie). Leave off for best-of-3. The bracket always plays
                  best-of-3.
                </span>
              </label>
            </div>
            <Field
              label="Registration deadline"
              error={errors.registrationDeadline?.message}
            >
              <Input
                type="datetime-local"
                {...register("registrationDeadline")}
              />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              Choose who can enter match scores and whether a second party must
              confirm. Pool play often uses the reffing team. You can change
              this later.
            </p>
            <ScoringFields
              value={{
                allowCaptainEntry: watch("allowCaptainEntry"),
                allowRefEntry: watch("allowRefEntry"),
                allowOrganizerEntry: watch("allowOrganizerEntry"),
                requireConfirmation: watch("requireConfirmation"),
              }}
              onChange={(v) => {
                setValue("allowCaptainEntry", v.allowCaptainEntry);
                setValue("allowRefEntry", v.allowRefEntry);
                setValue("allowOrganizerEntry", v.allowOrganizerEntry);
                setValue("requireConfirmation", v.requireConfirmation);
              }}
            />
          </div>
        )}

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
          >
            Back
          </Button>
          {step < STEP_TITLES.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create tournament"}
            </Button>
          )}
        </div>
      </form>
    </div>
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
