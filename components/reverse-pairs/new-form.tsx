"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { createReversePairsAction } from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const schema = z.object({
  name: z.string().trim().min(2, "Give it a name.").max(100),
  sport: z.enum(["indoor6", "beach2", "coed4"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  venue: z.string().trim().max(120).optional(),
  courts: z.coerce.number().int().min(1, "At least 1.").max(12),
  minutesPerGame: z.coerce.number().int().min(5).max(120),
  pointsPerGame: z.coerce.number().int().min(5).max(99),
});

type Values = z.input<typeof schema>;

/**
 * Creating the event, without deciding the night.
 *
 * No round count here: it depends on how many pairs turn up, and twelve pairs
 * and sixteen want different nights on the same two courts. The draw panel asks
 * once the field is in, and suggests the counts where nobody plays more games
 * than anybody else.
 */
export function NewReversePairsForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      sport: "indoor6",
      courts: 2,
      minutesPerGame: 15,
      pointsPerGame: 25,
    },
  });

  function onSubmit(values: Values) {
    start(async () => {
      const res = await createReversePairsAction(orgId, {
        ...values,
        courts: Number(values.courts),
        minutesPerGame: Number(values.minutesPerGame),
        pointsPerGame: Number(values.pointsPerGame),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Event created. Add your pairs next.");
      router.push(`/orgs/${orgId}/reverse-pairs/${res.competitionId}`);
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Field label="Name" error={errors.name?.message}>
            <Input
              placeholder="Reverse Pairs Thursdays"
              {...register("name")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sport" error={errors.sport?.message}>
              <select
                className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
                {...register("sport")}
              >
                <option value="indoor6">Indoor 6s</option>
                <option value="beach2">Beach</option>
                <option value="coed4">Co-ed 4s</option>
              </select>
            </Field>
            <Field label="Date" error={errors.date?.message}>
              <Input type="date" {...register("date")} />
            </Field>
          </div>

          <Field label="Venue" error={errors.venue?.message}>
            <Input placeholder="Optional" {...register("venue")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Courts"
              error={errors.courts?.message}
              hint="Six pairs per court."
            >
              <Input type="number" min={1} max={12} {...register("courts")} />
            </Field>
            <Field
              label="Points per game"
              error={errors.pointsPerGame?.message}
            >
              <Input
                type="number"
                min={5}
                max={99}
                {...register("pointsPerGame")}
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
                {...register("minutesPerGame")}
              />
            </Field>
          </div>

          <p className="text-ink-3 text-sm">
            How many rounds you play depends on how many pairs turn up, so
            that&rsquo;s decided when you draw the schedule — with the counts
            that split evenly offered up front.
          </p>

          <Button
            type="submit"
            disabled={pending}
            className="justify-self-start"
          >
            {pending ? "Creating…" : "Create event"}
          </Button>
        </form>
      </CardContent>
    </Card>
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
      {hint && !error && <p className="text-ink-3 text-xs">{hint}</p>}
      {error && <p className="text-claret text-xs">{error}</p>}
    </div>
  );
}
