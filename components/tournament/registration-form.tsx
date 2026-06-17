"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { registerTeamAction } from "@/server/actions/tournaments";
import {
  registerTeamSchema,
  type RegisterTeamInput,
} from "@/lib/validations/tournament";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegistrationForm({
  competitionId,
  divisions,
  rosterSize,
  isAuthed,
  userEmail,
  loginHref,
}: {
  competitionId: string;
  divisions: { id: string; name: string }[];
  rosterSize: number;
  isAuthed: boolean;
  userEmail?: string;
  loginHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<RegisterTeamInput>({
    resolver: zodResolver(registerTeamSchema),
    defaultValues: {
      teamName: "",
      divisionId: divisions[0]?.id ?? "",
      playerEmails: Array.from({ length: rosterSize }, (_, i) =>
        i === 0 ? (userEmail ?? "") : "",
      ),
    },
  });
  const { register, handleSubmit, reset, formState } = form;

  if (!isAuthed) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Sign in to register your team.
        </p>
        <Button asChild className="justify-self-start">
          <Link href={loginHref}>Sign in to register</Link>
        </Button>
      </div>
    );
  }

  function onSubmit(values: RegisterTeamInput) {
    startTransition(async () => {
      const result = await registerTeamAction(competitionId, values);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("You're registered! See your team below.");
      reset({
        teamName: "",
        divisionId: values.divisionId,
        playerEmails: Array.from({ length: rosterSize }, (_, i) =>
          i === 0 ? (userEmail ?? "") : "",
        ),
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label>Team name</Label>
        <Input placeholder="Kohl / Thomas" {...register("teamName")} />
        {formState.errors.teamName && (
          <p className="text-destructive text-sm">
            {formState.errors.teamName.message}
          </p>
        )}
      </div>

      {divisions.length > 1 && (
        <div className="grid gap-1.5">
          <Label>Division</Label>
          <select
            {...register("divisionId")}
            className="border-border bg-surface h-9 w-full rounded-md border px-3 text-sm"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label>Player emails</Label>
        <div className="grid gap-2">
          {Array.from({ length: rosterSize }, (_, i) => (
            <Input
              key={i}
              type="email"
              placeholder={i === 0 ? "You (captain)" : `Player ${i + 1}`}
              readOnly={i === 0 && !!userEmail}
              {...register(`playerEmails.${i}` as const)}
            />
          ))}
        </div>
        {formState.errors.playerEmails && (
          <p className="text-destructive text-sm">
            Enter a valid email for each player.
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Registering…" : "Register team"}
      </Button>
    </form>
  );
}
