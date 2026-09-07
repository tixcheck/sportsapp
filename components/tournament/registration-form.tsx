"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { registerTeamAction } from "@/server/actions/tournaments";
import {
  startRegistrationCheckoutAction,
  startShareCheckoutAction,
} from "@/server/actions/registration-payments";
import {
  registerTeamSchema,
  type RegisterTeamInput,
} from "@/lib/validations/tournament";
import { Button } from "@/components/ui/button";
import { PaymentModeChoice } from "@/components/payments/payment-mode-choice";
import {
  QuestionFields,
  missingRequired,
} from "@/components/registration/question-fields";
import type {
  AnswerMap,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { saveRegistrationAnswersAction } from "@/server/actions/registration-questions";
import { Input } from "@/components/ui/input";
import { startOfflinePaymentAction } from "@/server/actions/registration-payments";
import type { PaymentMode } from "@/components/payments/payment-mode-choice";
import { Label } from "@/components/ui/label";

export type RegisterResult = { error: string } | { teamId: string };

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
  teamQuestions = [],
  playerQuestions = [],
  playerAnswers = {},
  suggestedAnswers = {},
  addressAutocomplete = false,
  fee,
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
  /** The organizer's questions about the entry, answered by the captain. */
  teamQuestions?: RegistrationQuestion[];
  /** The organizer's questions of every player — the captain is one. */
  playerQuestions?: RegistrationQuestion[];
  /** Anything they've already answered for this competition. */
  playerAnswers?: AnswerMap;
  /** Carried from another competition of the same org, awaiting confirmation. */
  suggestedAnswers?: AnswerMap;
  /** Whether a Places key is configured; false renders a plain input. */
  addressAutocomplete?: boolean;
  /** Null on a free event, or one that doesn't ask for payment up front. */
  fee?: {
    /** What the whole team owes, in cents. */
    teamCents: number;
    allowCaptainPays: boolean;
    allowSplitPayment: boolean;
    /** Registration only counts once the fee is covered. */
    paymentRequired: boolean;
    /** Where an e-transfer goes, or null when the organizer takes cards only. */
    etransferEmail?: string | null;
    /** The organizer's PayPal payment link, or null when they don't take it. */
    paypalUrl?: string | null;
    /** Tax on the fee — an e-transfer pays it, so the quote must show it. */
    taxCents?: number;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * What the captain picked. E-transfer and PayPal are payment METHODS, not
   * kinds — the stored `paymentMode` stays team_full/player_share so nothing
   * downstream has to learn a third value.
   *
   * Defaulted to whatever this event actually offers rather than to card. An
   * organizer collecting through PayPal has no Stripe account, so a hardcoded
   * `team_full` default would send the first captain who submits without
   * touching the options to a checkout that cannot be created.
   */
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Real answers win over a suggestion; a suggestion only fills a gap.
  const [mine, setMine] = useState<AnswerMap>({
    ...suggestedAnswers,
    ...playerAnswers,
  });
  // Structured detail behind a picked address, sent with the answers.
  const [meta, setMeta] = useState<Record<string, Record<string, unknown>>>({});
  const [choice, setChoice] = useState<PaymentMode>(() =>
    fee?.allowCaptainPays
      ? "team_full"
      : fee?.allowSplitPayment
        ? "player_share"
        : fee?.paypalUrl
          ? "paypal"
          : fee?.etransferEmail
            ? "etransfer"
            : "team_full",
  );

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
      // Captain-pays unless they say otherwise; ignored entirely on free events.
      paymentMode: "team_full",
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
    const missing = [
      ...missingRequired(teamQuestions, answers),
      ...missingRequired(playerQuestions, mine),
    ];
    if (missing.length > 0) {
      toast.error(`Still needed: ${missing.map((q) => q.label).join(", ")}`);
      return;
    }
    startTransition(async () => {
      const result = await action(competitionId, values);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      // A team answer needs a team, so this happens after registration. A
      // failure warns rather than unwinding a completed sign-up.
      if (Object.keys(mine).length > 0) {
        const savedMine = await saveRegistrationAnswersAction({
          competitionId,
          answers: mine,
          metadata: meta,
        });
        if ("error" in savedMine) {
          toast.error(`Registered, but: ${savedMine.error}`);
        }
      }

      if ("teamId" in result && Object.keys(answers).length > 0) {
        const saved = await saveRegistrationAnswersAction({
          competitionId,
          teamId: result.teamId,
          answers,
        });
        if ("error" in saved) toast.error(`Registered, but: ${saved.error}`);
      }
      // A gated event isn't finished at "registered" — the team is not an
      // entrant until it pays, so send them straight on rather than leaving
      // them to discover a Pay button somewhere else.
      if (fee?.paymentRequired && fee.teamCents > 0 && "teamId" in result) {
        // Paying the organizer directly. We record the obligation and then
        // hand them off — to PayPal, or to their own banking app. Either way
        // the team is NOT confirmed by this; only the organizer confirming the
        // money arrived does that.
        if (choice === "etransfer" || choice === "paypal") {
          const started = await startOfflinePaymentAction(
            competitionId,
            result.teamId,
            choice,
          );
          if ("error" in started) {
            toast.error(started.error);
            router.push(`/teams/${result.teamId}`);
            return;
          }

          if (started.method === "paypal" && started.paypalUrl) {
            toast.success("Registered — sending you to PayPal.");
            // A full navigation, not a new tab: PayPal's link is a page, and
            // its return URL is what brings them back to us afterwards.
            window.location.href = started.paypalUrl;
            return;
          }

          toast.success("Registered — check your email for where to send it.");
          router.push(`/teams/${result.teamId}`);
          return;
        }

        toast.success("Team created — one more step to confirm your spot.");
        const checkout =
          values.paymentMode === "player_share"
            ? await startShareCheckoutAction(competitionId, result.teamId)
            : await startRegistrationCheckoutAction(
                competitionId,
                result.teamId,
              );
        if ("url" in checkout) {
          window.location.href = checkout.url;
          return;
        }
        // Payment couldn't start; the team page still has a Pay button, so say
        // what happened rather than stranding them on a form that looks done.
        toast.error(checkout.error);
        router.push(`/teams/${result.teamId}`);
        return;
      }

      toast.success("You're registered! See your team below.");
      reset({
        teamName: "",
        divisionId: values.divisionId,
        players: emptyPlayers(),
        paymentMode: values.paymentMode,
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

      {teamQuestions.length > 0 && (
        <div className="border-rule grid gap-4 border-t pt-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            About the team
          </p>
          <QuestionFields
            questions={teamQuestions}
            values={answers}
            onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
            disabled={pending}
            addressAutocomplete={addressAutocomplete}
          />
        </div>
      )}

      {playerQuestions.length > 0 && (
        <div className="border-rule grid gap-4 border-t pt-4">
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              About you
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Your teammates will be asked the same when they join.
            </p>
          </div>
          <QuestionFields
            questions={playerQuestions}
            values={mine}
            onChange={(id, v) => setMine((a) => ({ ...a, [id]: v }))}
            onMeta={(id, m) => setMeta((s) => ({ ...s, [id]: m }))}
            disabled={pending}
            suggested={suggestedAnswers}
            addressAutocomplete={addressAutocomplete}
          />
        </div>
      )}

      {fee &&
        fee.teamCents > 0 &&
        (fee.allowCaptainPays ||
          fee.allowSplitPayment ||
          fee.etransferEmail ||
          fee.paypalUrl) && (
          <PaymentModeChoice
            teamCents={fee.teamCents}
            players={
              form.watch("players").filter((p) => p.email?.trim()).length
            }
            value={choice}
            onChange={(v) => {
              setChoice(v);
              // Paying the organizer directly always settles the whole team
              // fee: splitting one would leave them reconciling six separate
              // transfers against a link that names none of them.
              form.setValue(
                "paymentMode",
                v === "player_share" ? "player_share" : "team_full",
              );
            }}
            allowCaptainPays={fee.allowCaptainPays}
            allowSplitPayment={fee.allowSplitPayment}
            etransferEmail={fee.etransferEmail}
            paypalUrl={fee.paypalUrl}
            taxCents={fee.taxCents}
          />
        )}

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending
          ? "Registering…"
          : fee?.paymentRequired && fee.teamCents > 0
            ? "Register & pay"
            : "Register team"}
      </Button>
    </form>
  );
}
