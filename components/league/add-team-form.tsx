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

export function AddTeamForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<AddTeamInput>({
    resolver: zodResolver(addTeamSchema),
    defaultValues: { name: "", captainEmail: "" },
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
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add team"}
      </Button>
    </form>
  );
}
