"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateIndividualSignupSettingsAction } from "@/server/actions/free-agents";
import { hasPositions } from "@/lib/sports";
import type { Sport } from "@/lib/formats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paypalLinkMessage, paypalLinkProblem } from "@/lib/payments/paypal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Whether this event takes players who have no team, and what they pay.
 *
 * The fee is entered in dollars and stored in cents — every amount in the
 * payments code is integer cents, and the conversion belongs at the edge where
 * a human types a price, not in the middle of the money math.
 */
export function IndividualSignupSettings({
  competitionId,
  sport,
  allowIndividualSignups,
  individualFeeCents,
  paypalIndividualUrl,
  maxIndividualSignups,
  currentSignups = 0,
}: {
  competitionId: string;
  sport: Sport;
  allowIndividualSignups: boolean;
  individualFeeCents: number;
  /** The organizer's PayPal link for an individual fee, when they use one. */
  paypalIndividualUrl?: string | null;
  /** How many individuals to take. Null = no limit. */
  maxIndividualSignups?: number | null;
  /** How many have signed up already, so a limit below that can be flagged. */
  currentSignups?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [allow, setAllow] = useState(allowIndividualSignups);
  const [fee, setFee] = useState(
    individualFeeCents > 0 ? String(individualFeeCents / 100) : "",
  );
  const [paypal, setPaypal] = useState(paypalIndividualUrl ?? "");
  const [cap, setCap] = useState(
    maxIndividualSignups === null || maxIndividualSignups === undefined
      ? ""
      : String(maxIndividualSignups),
  );

  // Validated as they type: they're pasting from another tab, and finding out
  // after a round trip means going back to find the link again.
  const paypalProblem = paypal.trim() ? paypalLinkProblem(paypal) : null;

  function save() {
    const dollars = fee.trim() === "" ? 0 : Number(fee);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast.error("That fee doesn't look right.");
      return;
    }
    if (paypalProblem) {
      toast.error(paypalLinkMessage(paypalProblem));
      return;
    }
    startTransition(async () => {
      const result = await updateIndividualSignupSettingsAction({
        competitionId,
        allowIndividualSignups: allow,
        individualFeeCents: Math.round(dollars * 100),
        paypalIndividualUrl: paypal.trim(),
        maxIndividualSignups: cap.trim() === "" ? null : Number(cap),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Individual sign-ups</CardTitle>
        <CardDescription>
          Let players without a team put their name down. They answer{" "}
          {hasPositions(sport)
            ? "which positions they play and what level they're at"
            : "what level they're at"}
          , and you place them on a team.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={allow}
            onChange={(e) => setAllow(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="text-sm">
            Accept individual sign-ups
            <span className="text-muted-foreground block text-xs">
              Shown on the registration page alongside team sign-up. Individuals
              don&apos;t count against your team cap.
            </span>
          </span>
        </label>

        <div className="grid gap-1.5">
          <Label htmlFor="individual-fee">Fee per individual</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">$</span>
            <Input
              id="individual-fee"
              inputMode="decimal"
              placeholder="0.00"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="max-w-32"
              disabled={!allow}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Separate from the team fee — leave blank for free. A player
            isn&apos;t added to your pool until this is paid.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="individual-cap">
            Maximum individuals{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="individual-cap"
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            placeholder="No limit"
            className="max-w-28 tabular-nums"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            disabled={!allow}
          />
          {/*
            Every free agent is a promise to place them on a team, so the
            number an organizer should pick is the number they can actually
            find spots for — not the number who would like to sign up.
          */}
          <p className="text-muted-foreground text-xs">
            Sign-ups close once this many have joined. Separate from your team
            cap. Withdrawn sign-ups free their place back up.
            {currentSignups > 0 && ` ${currentSignups} so far.`}
          </p>
          {cap.trim() !== "" &&
            Number(cap) > 0 &&
            Number(cap) < currentSignups && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {currentSignups} people have already signed up. Nobody is
                removed by lowering this — it just stops new sign-ups.
              </p>
            )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="individual-paypal">
            PayPal link for individuals{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="individual-paypal"
            type="url"
            inputMode="url"
            placeholder="https://www.paypal.com/ncp/payment/…"
            value={paypal}
            onChange={(e) => setPaypal(e.target.value)}
            disabled={!allow}
            aria-invalid={paypalProblem !== null}
          />
          {paypalProblem ? (
            <p className="text-destructive text-xs">
              {paypalLinkMessage(paypalProblem)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              A separate link from your team one, because the amount is
              different. Leave it blank and individuals are sent to the team
              link instead &mdash; which will charge them the team fee, so set
              this if the two differ.
            </p>
          )}
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
