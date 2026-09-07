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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  } | null;
  /** Where "done" goes; the team page once we know the id. */
  teamHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [teamName, setTeamName] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
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
      if ("teamId" in res) setTeamId(res.teamId);
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
              <select
                id="sr-division"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
              >
                <option value="">No preference</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
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
          onSigned={() => setSigned(true)}
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
