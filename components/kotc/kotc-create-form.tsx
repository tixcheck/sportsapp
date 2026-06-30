"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createKotcSchema, type CreateKotcInput } from "@/lib/validations/kotc";
import { createKotcCompetitionAction } from "@/server/actions/kotc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const METRICS: { value: CreateKotcInput["seedMetric"]; label: string }[] = [
  { value: "normalized_placement", label: "Normalized placement" },
  { value: "raw_points", label: "Raw points" },
];

export function KotcCreateForm({ orgId }: { orgId: string }) {
  const [pending, start] = useTransition();
  const [capEnabled, setCapEnabled] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateKotcInput>({
    resolver: zodResolver(createKotcSchema),
    defaultValues: {
      name: "",
      venue: "",
      pairsPerPool: 5,
      roundsPerSession: 3,
      roundMinutes: 15,
      pointCap: null,
      seedingRoundCount: 2,
      seedMetric: "normalized_placement",
    },
  });

  const metric = watch("seedMetric");

  function onSubmit(values: CreateKotcInput) {
    start(async () => {
      const res = await createKotcCompetitionAction(orgId, values);
      if (res && "error" in res) toast.error(res.error);
      // success → the action redirects to the new competition.
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-6">
      <Field label="Name" error={errors.name?.message}>
        <Input placeholder="Beach KotC — Saturday" {...register("name")} />
      </Field>

      <Field label="Venue (optional)" error={errors.venue?.message}>
        <Input placeholder="Woodbine Beach" {...register("venue")} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Pairs per pool" error={errors.pairsPerPool?.message}>
          <Input
            type="number"
            inputMode="numeric"
            className="tabular-nums"
            {...register("pairsPerPool", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Seeding rounds" error={errors.seedingRoundCount?.message}>
          <Input
            type="number"
            inputMode="numeric"
            className="tabular-nums"
            {...register("seedingRoundCount", { valueAsNumber: true })}
          />
        </Field>
        <Field
          label="Rounds / session"
          error={errors.roundsPerSession?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            className="tabular-nums"
            {...register("roundsPerSession", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Minutes / round" error={errors.roundMinutes?.message}>
          <Input
            type="number"
            inputMode="numeric"
            className="tabular-nums"
            {...register("roundMinutes", { valueAsNumber: true })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={capEnabled}
            onChange={(e) => {
              setCapEnabled(e.target.checked);
              setValue("pointCap", e.target.checked ? 11 : null);
            }}
          />
          Cap points per round
        </label>
        {capEnabled && (
          <Input
            type="number"
            inputMode="numeric"
            className="w-28 tabular-nums"
            {...register("pointCap", { valueAsNumber: true })}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label>Seed metric</Label>
        <div className="border-border flex w-fit rounded-md border p-0.5 text-xs">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setValue("seedMetric", m.value)}
              className={cn(
                "rounded px-2.5 py-1",
                metric === m.value
                  ? "bg-accent font-medium"
                  : "text-muted-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Normalized placement seeds fairly across pools of different strength
          and size; raw points is simpler but biased by the draw.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create competition"}
      </Button>
    </form>
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
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
