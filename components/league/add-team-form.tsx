"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { addTeamAction } from "@/server/actions/leagues";
import { addTeamSchema, type AddTeamInput } from "@/lib/validations/league";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddTeamForm({
  competitionId,
  tiers = [],
}: {
  competitionId: string;
  /** League tiers to pick from — a tier select shows only when there are 2+. */
  tiers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<AddTeamInput>({
    resolver: zodResolver(addTeamSchema),
    defaultValues: {
      name: "",
      captainEmail: "",
      partnerEmail: "",
      divisionId: tiers.length > 1 ? tiers[0].id : null,
    },
  });
  const { register, handleSubmit, reset, formState } = form;

  function onSubmit(values: AddTeamInput) {
    startTransition(async () => {
      const result = await addTeamAction(competitionId, values);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.emailSent
          ? "Team added — invite emailed to the captain."
          : "Team added — copy the invite link to send it.",
      );
      reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <Input placeholder="Team name" {...register("name")} />
        {formState.errors.name && (
          <p className="text-destructive mt-1 text-sm">
            {formState.errors.name.message}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Input
            type="email"
            placeholder="captain@email.com"
            {...register("captainEmail")}
          />
          {formState.errors.captainEmail && (
            <p className="text-destructive mt-1 text-sm">
              {formState.errors.captainEmail.message}
            </p>
          )}
        </div>
        <div>
          <Input
            type="email"
            placeholder="partner@email.com (optional)"
            {...register("partnerEmail")}
          />
          {formState.errors.partnerEmail && (
            <p className="text-destructive mt-1 text-sm">
              {formState.errors.partnerEmail.message}
            </p>
          )}
        </div>
      </div>
      {tiers.length > 1 && (
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-medium">
            Tier
          </label>
          <select
            className="border-border bg-surface h-9 w-full rounded-md border px-2 text-sm"
            {...register("divisionId")}
          >
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Add both partners&apos; emails so each sees the schedule and can enter
        scores. The partner is optional — the captain can add them later.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add team"}
      </Button>
    </form>
  );
}
