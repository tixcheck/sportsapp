"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";

import { createLeagueAction } from "@/server/actions/leagues";
import {
  createLeagueSchema,
  DAY_LABELS,
  type CreateLeagueInput,
} from "@/lib/validations/league";
import {
  FORMAT_PRESETS,
  SPORTS,
  defaultPreset,
  type Sport,
} from "@/lib/formats";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScoringFields } from "@/components/scoring/scoring-fields";

const STEP_FIELDS: (keyof CreateLeagueInput)[][] = [
  ["sport"],
  [
    "name",
    "startDate",
    "endDate",
    "venue",
    "courts",
    "roundsPerTeam",
    "gamesPerTeam",
  ],
  ["slotDayOfWeek", "slotStartTime"],
  ["formatId"],
  [],
];

const STEP_TITLES = ["Sport", "Details", "Schedule", "Format", "Scoring"];

export function LeagueWizard({ orgId }: { orgId: string }) {
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateLeagueInput>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: {
      name: "",
      sport: "indoor6",
      startDate: "",
      endDate: "",
      venue: "",
      courts: 2,
      roundsPerTeam: 1,
      gamesPerTeam: null,
      slotDayOfWeek: 2,
      slotStartTime: "19:00",
      formatId: defaultPreset("indoor6").id,
      twoSetRoundRobin: false,
      blackoutDates: [],
      allowCaptainEntry: false,
      allowRefEntry: false,
      allowOrganizerEntry: true,
      requireConfirmation: false,
    },
  });
  const { register, watch, setValue, trigger, handleSubmit, formState } = form;
  const errors = formState.errors;
  const sport = watch("sport") as Sport;
  const rounds = watch("roundsPerTeam");
  const gamesPerTeam = watch("gamesPerTeam");

  async function next() {
    setFormError(null);
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  }

  function onSubmit(values: CreateLeagueInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await createLeagueAction(orgId, values);
      if (result?.error) setFormError(result.error);
    });
  }

  function parseBlackouts(raw: string) {
    const dates = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    setValue("blackoutDates", dates);
  }

  return (
    <div>
      {/* step indicator */}
      <ol className="mb-6 flex items-center gap-2 text-sm">
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
              className={cn(
                i === step
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
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
                  setValue("formatId", defaultPreset(s.value).id);
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
            <Field label="League name" error={errors.name?.message}>
              <Input placeholder="Tuesday Indoor 6s" {...register("name")} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Season start" error={errors.startDate?.message}>
                <Input type="date" {...register("startDate")} />
              </Field>
              <Field label="Season end" error={errors.endDate?.message}>
                <Input type="date" {...register("endDate")} />
              </Field>
            </div>
            <Field label="Venue" error={errors.venue?.message}>
              <Input placeholder="Mayfair Lakeshore" {...register("venue")} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Courts" error={errors.courts?.message}>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  {...register("courts", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Rounds per team"
                error={errors.roundsPerTeam?.message}
              >
                <div className="flex gap-2">
                  {[1, 2].map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setValue("roundsPerTeam", n)}
                      className={cn(
                        "h-9 flex-1 rounded-md border text-sm font-medium transition-colors",
                        rounds === n
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-surface hover:bg-muted",
                      )}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="Games per team"
                error={errors.gamesPerTeam?.message}
                hint="Leave blank for a full round robin (everyone plays everyone). Set a number for a partial schedule — each team plays that many different opponents."
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="All (full round robin)"
                  value={gamesPerTeam ?? ""}
                  onChange={(e) =>
                    setValue(
                      "gamesPerTeam",
                      e.target.value === "" ? null : Number(e.target.value),
                      { shouldValidate: true },
                    )
                  }
                  className="border-border bg-surface h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Match day" error={errors.slotDayOfWeek?.message}>
                <select
                  {...register("slotDayOfWeek", { valueAsNumber: true })}
                  className="border-border bg-surface h-9 w-full rounded-md border px-3 text-sm"
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
            <Field label="Blackout dates (optional)">
              <Input
                placeholder="2026-02-17, 2026-03-10"
                onChange={(e) => parseBlackouts(e.target.value)}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Comma-separated YYYY-MM-DD. These weeks are skipped.
              </p>
            </Field>
          </div>
        )}

        {step === 3 && (
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
            <label className="text-muted-foreground flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-claret mt-0.5 size-4"
                {...register("twoSetRoundRobin")}
              />
              <span>
                Play each game as{" "}
                <strong className="text-foreground">2 sets</strong> (can end
                1–1, a tie) instead of best-of-3.
              </span>
            </label>
            <Review form={watch()} />
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              Choose who can enter match scores and whether a second party must
              confirm. You can change this later.
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
              {pending ? "Creating…" : "Create league"}
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

function Review({ form }: { form: CreateLeagueInput }) {
  const sportLabel = SPORTS.find((s) => s.value === form.sport)?.label;
  return (
    <dl className="bg-muted text-muted-foreground grid gap-1 rounded-lg p-4 text-sm">
      <Row k="Sport" v={sportLabel} />
      <Row k="Season" v={`${form.startDate || "?"} → ${form.endDate || "?"}`} />
      <Row k="Venue" v={form.venue || "—"} />
      <Row
        k="Schedule"
        v={`${DAY_LABELS[form.slotDayOfWeek]}s at ${form.slotStartTime}, ${form.courts} court(s)`}
      />
      <Row
        k="Rounds"
        v={
          form.gamesPerTeam
            ? `${form.gamesPerTeam} games/team (partial round robin)`
            : `${form.roundsPerTeam}× full round robin`
        }
      />
    </dl>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{k}</dt>
      <dd className="text-foreground text-right font-medium">{v}</dd>
    </div>
  );
}
