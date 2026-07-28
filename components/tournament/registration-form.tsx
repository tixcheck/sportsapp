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

type RegisterResult = { error: string } | { teamId: string };

export function RegistrationForm({
  competitionId,
  divisions,
  rosterSize,
  isAuthed,
  userEmail,
  loginHref,
  action = registerTeamAction,
  // "division" (tournaments) vs "tier" (leagues) — just the label players see.
  divisionLabel = "Division",
}: {
  competitionId: string;
  divisions: { id: string; name: string }[];
  rosterSize: number;
  isAuthed: boolean;
  userEmail?: string;
  loginHref: string;
  action?: (
    competitionId: string,
    values: RegisterTeamInput,
  ) => Promise<RegisterResult>;
  divisionLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const emptyPlayers = () =>
    Array.from({ length: rosterSize }, (_, i) => ({
      name: "",
      email: i === 0 ? (userEmail ?? "") : "",
    }));

  const form = useForm<RegisterTeamInput>({
    resolver: zodResolver(registerTeamSchema),
    defaultValues: {
      teamName: "",
      divisionId: divisions[0]?.id ?? "",
      players: emptyPlayers(),
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
      const result = await action(competitionId, values);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("You're registered! See your team below.");
      reset({
        teamName: "",
        divisionId: values.divisionId,
        players: emptyPlayers(),
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
          <Label>{divisionLabel}</Label>
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
        <Label>Players</Label>
        <p className="text-muted-foreground text-xs">
          A name and email for each player. The email is how they log in to see
          the schedule and enter scores; the name just makes the roster easier
          to read. Only the captain&apos;s email is required.
        </p>
        <div className="grid gap-2">
          {Array.from({ length: rosterSize }, (_, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                placeholder={i === 0 ? "Your name" : `Player ${i + 1} name`}
                {...register(`players.${i}.name` as const)}
              />
              <Input
                type="email"
                placeholder={i === 0 ? "You (captain)" : "Email (optional)"}
                readOnly={i === 0 && !!userEmail}
                {...register(`players.${i}.email` as const)}
              />
            </div>
          ))}
        </div>
        {formState.errors.players && (
          <p className="text-destructive text-sm">
            {formState.errors.players.message ??
              "Enter a valid email for each player you add."}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Registering…" : "Register team"}
      </Button>
    </form>
  );
}
