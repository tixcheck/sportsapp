"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Check } from "lucide-react";

import {
  registerIndividualAction,
  type IndividualSignupInput,
} from "@/server/actions/free-agents";
import { startIndividualCheckoutAction } from "@/server/actions/registration-payments";
import { SKILL_LEVELS, skillLabel, sportConfig } from "@/lib/sports";
import type { Sport } from "@/lib/formats";
import type { FreeAgent } from "@/lib/queries/free-agents";
import { formatCents } from "@/lib/payments/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Values = {
  name: string;
  email: string;
  phone: string;
  positions: string[];
  skillLevel: string;
  notes: string;
};

/**
 * Signing up without a team.
 *
 * The questions are the organizer's, not the player's: positions and level
 * exist so whoever builds the teams knows what they're working with. They are
 * shown back to the player afterwards so a sign-up never feels like it vanished
 * into a form.
 */
export function IndividualSignupForm({
  competitionId,
  sport,
  isAuthed,
  userEmail,
  userName,
  loginHref,
  feeCents,
  existing,
}: {
  competitionId: string;
  sport: Sport;
  isAuthed: boolean;
  userEmail?: string;
  userName?: string;
  loginHref: string;
  /** 0 when individual sign-up is free. */
  feeCents: number;
  /** Their existing sign-up, when they've already done this. */
  existing?: FreeAgent | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const positions = sportConfig(sport).positions;

  const form = useForm<Values>({
    defaultValues: {
      name: existing?.name ?? userName ?? "",
      email: existing?.email ?? userEmail ?? "",
      phone: existing?.phone ?? "",
      positions: existing?.positions ?? [],
      skillLevel: existing?.skillLevel ?? "",
      notes: existing?.notes ?? "",
    },
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const chosen = watch("positions") ?? [];
  const chosenLevel = watch("skillLevel");

  if (!isAuthed) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Sign in to put your name down as an individual.
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link href={loginHref}>Sign in to sign up</Link>
        </Button>
      </div>
    );
  }

  function togglePosition(p: string) {
    setValue(
      "positions",
      chosen.includes(p) ? chosen.filter((x) => x !== p) : [...chosen, p],
      { shouldDirty: true },
    );
  }

  function onSubmit(values: Values) {
    if (!values.skillLevel) {
      toast.error("Pick the level that fits you best.");
      return;
    }
    startTransition(async () => {
      const payload: IndividualSignupInput = {
        competitionId,
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        positions: values.positions,
        skillLevel: values.skillLevel,
        notes: values.notes || undefined,
      };
      const result = await registerIndividualAction(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      // A paid sign-up isn't finished at "registered" — they aren't in the pool
      // until the fee lands, so send them on rather than leaving them to find a
      // Pay button later.
      if (result.feeCents > 0) {
        toast.success("Nearly there — just the fee to settle.");
        const checkout = await startIndividualCheckoutAction(
          competitionId,
          result.freeAgentId,
        );
        if ("url" in checkout) {
          window.location.href = checkout.url;
          return;
        }
        toast.error(checkout.error);
        router.refresh();
        return;
      }

      toast.success("You're on the list — the organizer will be in touch.");
      router.refresh();
    });
  }

  const isUpdate = !!existing;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      {existing && (
        <div className="border-border bg-paper-sunken rounded-lg border p-3">
          <p className="text-sm font-medium">
            {existing.status === "pending_payment"
              ? "Your sign-up is waiting on the fee."
              : existing.status === "placed"
                ? `You've been placed on ${existing.placedTeamName ?? "a team"}.`
                : existing.status === "withdrawn"
                  ? "Your sign-up was withdrawn."
                  : "You're on the list."}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Change anything below and save again to update it.
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="fa-name">Your name</Label>
        <Input
          id="fa-name"
          placeholder="Priya Sharma"
          {...register("name", { required: true })}
        />
        {formState.errors.name && (
          <p className="text-destructive text-sm">We need your name.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fa-email">Email</Label>
          <Input
            id="fa-email"
            type="email"
            placeholder="you@example.com"
            {...register("email", { required: true })}
          />
          {formState.errors.email && (
            <p className="text-destructive text-sm">We need an email.</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fa-phone">
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="fa-phone"
            placeholder="416 555 0134"
            {...register("phone")}
          />
        </div>
      </div>

      {/* Omitted entirely for a sport whose positions we haven't confirmed —
          better to ask nothing than to offer the wrong roles. */}
      {positions.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            Positions you&apos;re comfortable playing
            <span className="text-muted-foreground font-normal">
              {" "}
              — pick as many as apply
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {positions.map((p) => {
              const on = chosen.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePosition(p)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:bg-paper-sunken",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {p}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Your level</legend>
        <div className="flex flex-wrap gap-2">
          {SKILL_LEVELS.map((l) => {
            const on = chosenLevel === l.value;
            return (
              <button
                key={l.value}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setValue("skillLevel", l.value, { shouldDirty: true })
                }
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:bg-paper-sunken",
                )}
              >
                {on && <Check className="size-3.5" />}
                {l.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="fa-notes">
          Anything the organizer should know{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="fa-notes"
          rows={3}
          maxLength={1000}
          placeholder="I can only make the later start times."
          className="border-input bg-surface placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
          {...register("notes")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : feeCents > 0
              ? `${isUpdate ? "Update and pay" : "Sign up"} — ${formatCents(feeCents)}`
              : isUpdate
                ? "Update my sign-up"
                : "Sign me up"}
        </Button>
        {feeCents > 0 && (
          <p className="text-muted-foreground text-xs">
            You&apos;ll be taken to Stripe to pay.
          </p>
        )}
      </div>

      {chosen.length > 0 && (
        <p className="text-muted-foreground text-xs">
          The organizer will see: {chosen.join(", ")}
          {chosenLevel ? ` · ${skillLabel(chosenLevel as never)}` : ""}
        </p>
      )}
    </form>
  );
}
