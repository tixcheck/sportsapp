"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { addTournamentTeamAction } from "@/server/actions/tournaments";
import { addTeamSchema, type AddTeamInput } from "@/lib/validations/league";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddTournamentTeamForm({
  competitionId,
  divisions,
}: {
  competitionId: string;
  divisions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const form = useForm<AddTeamInput>({
    resolver: zodResolver(addTeamSchema),
    defaultValues: { name: "", captainEmail: "" },
  });
  const { register, handleSubmit, reset, formState } = form;

  function onSubmit(values: AddTeamInput) {
    startTransition(async () => {
      const result = await addTournamentTeamAction(
        competitionId,
        divisionId,
        values,
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.emailSent
          ? "Team added — invite emailed to the captain."
          : "Team added — copy the invite link to send it.",
        // TEMP DIAGNOSTIC (remove after): show the email send result on screen.
        result.emailDebug
          ? { description: result.emailDebug, duration: 30000 }
          : undefined,
      );
      reset();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
    >
      <div className="flex-1">
        <Input placeholder="Team name" {...register("name")} />
        {formState.errors.name && (
          <p className="text-destructive mt-1 text-sm">
            {formState.errors.name.message}
          </p>
        )}
      </div>
      <div className="flex-1">
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
      {divisions.length > 1 && (
        <select
          value={divisionId}
          onChange={(e) => setDivisionId(e.target.value)}
          className="border-border bg-surface h-9 rounded-md border px-3 text-sm"
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add team"}
      </Button>
    </form>
  );
}
