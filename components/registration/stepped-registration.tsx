"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import type { RegisterTeamInput } from "@/lib/validations/tournament";
import type { RegisterResult } from "@/components/tournament/registration-form";
import {
  startOfflinePaymentAction,
  startRegistrationCheckoutAction,
} from "@/server/actions/registration-payments";
import { SignWaiver } from "@/components/waivers/sign-waiver";
import { AddTeammates } from "@/components/registration/add-teammates";
import {
  QuestionFields,
  missingRequired,
} from "@/components/registration/question-fields";
import type {
  AnswerMap,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { saveRegistrationAnswersAction } from "@/server/actions/registration-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/payments/format";
import { cn } from "@/lib/utils";

type StepId = "team" | "waiver" | "pay" | "roster";

/**
 * Registration as a sequence rather than one long form.
 *
 * The order is the organizer's, and it is the order that makes sense when
 * money and liability are both involved: name the team, agree the terms, pay,
 * and only then name the people. The single-form flow still exists and is
 * still used wherever the organizer allows players to pay their own shares —
 * splitting a fee needs a roster to divide across, and there isn't one yet at
 * the moment payment is taken here.
 *
 * The team row is created at step one, before payment, because everything
 * afterwards needs something to attach to: a payment needs a team, and a
 * waiver signature is recorded against the competition the team is in. It
 * holds a spot from that moment, exactly as the single-form flow does.
 */
export function SteppedRegistration({
  competitionId,
  divisions,
  divisionLabel,
  rosterSize,
  action,
  isAuthed,
  userEmail,
  userName,
  loginHref,
  fee,
  waiver,
  teamQuestions = [],
  playerQuestions = [],
  playerAnswers = {},
  suggestedAnswers = {},
  addressAutocomplete = false,
  teamHref,
}: {
  competitionId: string;
  divisions: { id: string; name: string }[];
  divisionLabel: string;
  rosterSize: number;
  action: (
    competitionId: string,
    values: RegisterTeamInput,
  ) => Promise<RegisterResult>;
  isAuthed: boolean;
  userEmail?: string;
  userName?: string;
  loginHref: string;
  /** Null on a free event, or one that doesn't take payment up front. */
  fee: {
    teamCents: number;
    taxCents: number;
    /** Card is only offered when the organizer can actually take one. */
    cardAvailable: boolean;
    paypalUrl: string | null;
    etransferEmail: string | null;
    etransferNote: string | null;
  } | null;
  /** The waiver this competition requires, or null. */
  waiver: {
    id: string;
    title: string;
    body: string;
    bodySha256: string;
    /** True once THIS user has already signed it. */
    signed: boolean;
    /** Whether each numbered clause is initialled separately. */
    requireInitials?: boolean;
  } | null;
  /**
   * The organizer's own questions about the ENTRY, answered once by the
   * captain. Asked here rather than afterwards because "is this team stronger
   * than last season" is only a meaningful question at sign-up.
   */
  teamQuestions?: RegistrationQuestion[];
  /**
   * The organizer's questions of every PLAYER, asked here because the captain
   * is one. Leaving them to the dashboard meant the person who registered the
   * team was the last to be asked for their own details.
   */
  playerQuestions?: RegistrationQuestion[];
  /** Anything they've already answered for this competition. */
  playerAnswers?: AnswerMap;
  /** Carried from another competition of the same org, awaiting confirmation. */
  suggestedAnswers?: AnswerMap;
  /** Whether a Places key is configured; false renders a plain input. */
  addressAutocomplete?: boolean;
  /** Where "done" goes; the team page once we know the id. */
  teamHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [teamName, setTeamName] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Real answers win over a suggestion; a suggestion only fills a gap.
  const [mine, setMine] = useState<AnswerMap>({
    ...suggestedAnswers,
    ...playerAnswers,
  });
  // Structured detail behind a picked address, sent with the answers.
  const [meta, setMeta] = useState<Record<string, Record<string, unknown>>>({});
  const [signed, setSigned] = useState(waiver?.signed ?? true);
  const [paid, setPaid] = useState(false);

  const needsWaiver = waiver !== null;
  const needsPayment = fee !== null && fee.teamCents > 0;

  const steps: { id: StepId; label: string }[] = [
    { id: "team", label: "Your team" },
    ...(needsWaiver ? [{ id: "waiver" as const, label: "Waiver" }] : []),
    ...(needsPayment ? [{ id: "pay" as const, label: "Payment" }] : []),
    { id: "roster", label: "Teammates" },
  ];

  const current: StepId =
    teamId === null
      ? "team"
      : needsWaiver && !signed
        ? "waiver"
        : needsPayment && !paid
          ? "pay"
          : "roster";

  if (!isAuthed) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Sign in to register a team. It takes a moment and keeps your team
          linked to you.
        </p>
        <Button asChild className="justify-self-start">
          <a href={loginHref}>Sign in to register</a>
        </Button>
      </div>
    );
  }

  function createTeam() {
    if (teamName.trim().length < 2) {
      toast.error("Give your team a name.");
      return;
    }
    const missing = [
      ...missingRequired(teamQuestions, answers),
      ...missingRequired(playerQuestions, mine),
    ];
    if (missing.length > 0) {
      toast.error(`Still needed: ${missing.map((q) => q.label).join(", ")}`);
      return;
    }
    start(async () => {
      // Only the captain goes on the roster here. The rest are invited at the
      // last step, once the money has actually moved.
      const res = await action(competitionId, {
        teamName: teamName.trim(),
        divisionId,
        paymentMode: "team_full",
        players: [{ name: userName ?? "", email: userEmail ?? "" }],
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      // The captain's own answers need no team — they belong to the person and
      // the competition — so they are saved whether or not the team write
      // below succeeds.
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

      if ("teamId" in res) {
        setTeamId(res.teamId);
        // After the team exists, because a team answer belongs to a team. A
        // failure here must not undo a completed registration, so it warns and
        // moves on — the captain can finish these from the team page.
        if (Object.keys(answers).length > 0) {
          const saved = await saveRegistrationAnswersAction({
            competitionId,
            teamId: res.teamId,
            answers,
          });
          if ("error" in saved) {
            toast.error(`Registered, but: ${saved.error}`);
          }
        }
      }
      router.refresh();
    });
  }

  function pay(method: "paypal" | "etransfer" | "card") {
    if (!teamId) return;
    start(async () => {
      if (method === "card") {
        const res = await startRegistrationCheckoutAction(
          competitionId,
          teamId,
        );
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        window.location.href = res.url;
        return;
      }

      const res = await startOfflinePaymentAction(
        competitionId,
        teamId,
        method,
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (method === "paypal" && res.paypalUrl) {
        window.location.href = res.paypalUrl;
        return;
      }
      // E-transfer has nowhere to send them, so the flow simply continues.
      setPaid(true);
      toast.success("Noted — check your email for where to send it.");
    });
  }

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {steps.map((s, i) => {
          const index = steps.findIndex((x) => x.id === current);
          const done = i < index;
          const now = s.id === current;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                  now && "bg-primary text-primary-foreground",
                  done && "bg-pine/15 text-pine",
                  !now && !done && "bg-muted text-muted-foreground",
                )}
              >
                {done && <Check className="size-3" />}
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="text-muted-foreground/50">→</span>
              )}
            </li>
          );
        })}
      </ol>

      {current === "team" && (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sr-team">Team name</Label>
            <Input
              id="sr-team"
              value={teamName}
              placeholder="Kohl / Thomas"
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>

          {divisions.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="sr-division">{divisionLabel}</Label>
              <NativeSelect
                id="sr-division"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">No preference</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

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

          {/*
            The captain answers these for THEMSELVES. Their teammates answer
            their own copies later, alongside the waiver — nobody fills these
            in on anyone else's behalf.
          */}
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

          <p className="text-muted-foreground text-sm">
            You&apos;ll add your teammates at the end — no need to have their
            emails to hand right now.
          </p>

          <Button
            onClick={createTeam}
            disabled={pending}
            className="justify-self-start"
          >
            {pending ? "Registering…" : "Continue"}
          </Button>
        </div>
      )}

      {current === "waiver" && waiver && (
        <SignWaiver
          competitionId={competitionId}
          competitionName={teamName}
          waiverId={waiver.id}
          title={waiver.title}
          body={waiver.body}
          bodySha256={waiver.bodySha256}
          suggestedName={userName ?? ""}
          requireInitials={waiver.requireInitials ?? false}
          addressAutocomplete={addressAutocomplete}
          onSigned={() => setSigned(true)}
          blockedReason={
            missingRequired(playerQuestions, mine).length > 0
              ? "Some of your details are still missing — go back and finish them."
              : undefined
          }
        />
      )}

      {current === "pay" && fee && (
        <div className="grid gap-3">
          <div className="bg-paper-sunken rounded-lg p-3 text-sm">
            <div className="flex justify-between font-medium">
              <span>Team fee</span>
              <span className="tabular-nums">
                {formatCents(fee.teamCents + fee.taxCents)}
              </span>
            </div>
          </div>

          {fee.paypalUrl && (
            <Button onClick={() => pay("paypal")} disabled={pending}>
              {pending ? "Opening PayPal…" : "Pay with PayPal"}
            </Button>
          )}
          {fee.cardAvailable && (
            <Button
              variant={fee.paypalUrl ? "outline" : "default"}
              onClick={() => pay("card")}
              disabled={pending}
            >
              {pending ? "Opening Stripe…" : "Pay by card"}
            </Button>
          )}
          {fee.etransferEmail && (
            <Button
              variant="outline"
              onClick={() => pay("etransfer")}
              disabled={pending}
            >
              I&apos;ll e-transfer {fee.etransferEmail}
            </Button>
          )}

          <p className="text-muted-foreground text-xs">
            {fee.cardAvailable
              ? "Card and platform fees are included where they apply."
              : "This goes straight to the organizer — no card or platform fees on top."}
          </p>
        </div>
      )}

      {current === "roster" && teamId && (
        <AddTeammates
          teamId={teamId}
          rosterSize={rosterSize}
          waiverRequired={needsWaiver}
          doneHref={teamHref ?? `/teams/${teamId}`}
        />
      )}
    </div>
  );
}
