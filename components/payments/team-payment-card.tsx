"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { startRegistrationCheckoutAction } from "@/server/actions/registration-payments";
import type {
  MemberShare,
  TeamPaymentState,
} from "@/lib/payments/registration-plan";
import { ShareList } from "./share-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCents } from "@/lib/payments/format";

/**
 * What this team owes, and the button that settles it.
 *
 * Deliberately shown even when card payment isn't available: a team still needs
 * to know a fee is outstanding so they can pay the organizer the way they
 * always have. Online payment is additive, not a replacement (PRD §14).
 */
export function TeamPaymentCard({
  competitionId,
  teamId,
  payment,
  /** What the payer would be charged, fees included. */
  totalDueCents,
  canPayOnline,
  canPay,
  allowCaptainPays,
  shares,
  viewerEmail,
  isAdmin,
}: {
  competitionId: string;
  teamId: string;
  payment: TeamPaymentState;
  totalDueCents: number;
  /** The organizer's Stripe account can actually take money. */
  canPayOnline: boolean;
  /** This viewer is on the team (or is the organizer). */
  canPay: boolean;
  /** The event allows one payment covering the whole team. */
  allowCaptainPays: boolean;
  /** Per-player shares — empty unless the event allows splitting. */
  shares: MemberShare[];
  viewerEmail: string | null;
  isAdmin: boolean;
}) {
  const [pending, start] = useTransition();

  if (payment.state === "free") return null;

  const paid = payment.state === "paid";

  function pay() {
    start(async () => {
      const res = await startRegistrationCheckoutAction(competitionId, teamId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      // Stripe Checkout is hosted — leave the app entirely.
      window.location.href = res.url;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CardTitle>Registration fee</CardTitle>
          <span
            className={`rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
              paid
                ? "bg-emerald-100 text-emerald-800"
                : payment.state === "partial"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-paper-sunken text-ink-2"
            }`}
          >
            {paid
              ? "Paid"
              : payment.state === "partial"
                ? "Part paid"
                : "Unpaid"}
          </span>
        </div>
        <CardDescription>
          {paid
            ? "This team's registration is paid in full."
            : "What this team owes to register."}
        </CardDescription>
      </CardHeader>

      {!paid && (
        <CardContent className="space-y-4">
          <dl className="space-y-1.5 text-sm tabular-nums">
            {payment.paidPriceCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Already paid</dt>
                <dd>{formatCents(payment.paidPriceCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Still owing</dt>
              <dd className="font-semibold">
                {formatCents(payment.outstandingPriceCents)}
              </dd>
            </div>
            {canPayOnline && totalDueCents > payment.outstandingPriceCents && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Card total, fees included
                </dt>
                <dd>{formatCents(totalDueCents)}</dd>
              </div>
            )}
          </dl>

          {canPayOnline && canPay && allowCaptainPays ? (
            <Button
              type="button"
              onClick={pay}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {pending
                ? "Opening Stripe…"
                : shares.length > 0
                  ? "Pay the whole team fee"
                  : "Pay by card"}
            </Button>
          ) : (
            !canPayOnline && (
              <p className="text-muted-foreground text-sm">
                Card payment isn&apos;t available for this event yet — arrange
                payment with the organizer.
              </p>
            )
          )}

          {/* Split mode: who owes what, and the viewer's own Pay button. */}
          {shares.length > 0 && (
            <ShareList
              competitionId={competitionId}
              teamId={teamId}
              shares={shares}
              viewerEmail={viewerEmail}
              canPayOnline={canPayOnline}
              isAdmin={isAdmin}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}
