"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { TeamLedgerRow } from "@/lib/payments/ledger";
import { refundableCents } from "@/lib/payments/refunds";
import { formatCents } from "@/lib/payments/format";
import {
  admitTeamUnpaidAction,
  refundTeamPaymentsAction,
  sendPaymentLinkAction,
} from "@/server/actions/organizer-payments";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";

const STATE_STYLES: Record<TeamLedgerRow["state"], string> = {
  paid: "bg-emerald-100 text-emerald-900",
  partial: "bg-amber-100 text-amber-900",
  unpaid: "bg-rose-100 text-rose-900",
  free: "bg-muted text-muted-foreground",
};

const STATE_LABEL: Record<TeamLedgerRow["state"], string> = {
  paid: "Paid",
  partial: "Part paid",
  unpaid: "Unpaid",
  free: "Free",
};

/**
 * One team's line on the payments dashboard, and everything an organizer can do
 * about it.
 *
 * Collapsed by default: the summary answers "do I need to chase them", and the
 * per-charge detail — which is where refunds live — only matters once you've
 * decided you do. Actions are deliberately not one-click; a refund and an
 * admission are both hard to walk back.
 */
export function PaymentTeamRow({
  team,
  currency,
}: {
  team: TeamLedgerRow;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const isPending = team.status === "pending_payment";
  const withdrawn = team.status === "withdrawn";
  const refundableCount = team.charges.filter(
    (c) => refundableCents(c) > 0,
  ).length;

  function admit() {
    start(async () => {
      const res = await admitTeamUnpaidAction({ teamId: team.teamId });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${team.teamName} is in. The balance still shows as owing.`,
      );
      router.refresh();
    });
  }

  function refundEveryone() {
    start(async () => {
      const res = await refundTeamPaymentsAction({ teamId: team.teamId });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.failed > 0
          ? `Refunded ${formatCents(res.totalCents, currency)} to ${res.refunded} payer${res.refunded === 1 ? "" : "s"}. ${res.failed} couldn't be refunded — try those individually.`
          : `Refunded ${formatCents(res.totalCents, currency)} to ${res.refunded} payer${res.refunded === 1 ? "" : "s"}.`,
      );
      router.refresh();
    });
  }

  function sendLink() {
    start(async () => {
      const res = await sendPaymentLinkAction({ teamId: team.teamId });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.sent === 1
          ? "Payment link sent."
          : `Payment link sent to ${res.sent} people.`,
      );
    });
  }

  return (
    <div className="border-border border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium">
              {team.teamName}
            </span>
            {withdrawn && (
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]">
                Withdrawn
              </span>
            )}
            {isPending && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-900">
                Not in the draw
              </span>
            )}
            {team.admittedUnpaid && (
              <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-900">
                <ShieldCheck className="size-3" />
                Admitted unpaid
              </span>
            )}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs tabular-nums">
            {formatCents(team.collectedPriceCents, currency)} collected
            {team.outstandingPriceCents > 0 && (
              <> · {formatCents(team.outstandingPriceCents, currency)} owing</>
            )}
            {team.refundedCents > 0 && (
              <> · {formatCents(team.refundedCents, currency)} refunded</>
            )}
          </span>
        </span>

        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            STATE_STYLES[team.state],
          )}
        >
          {STATE_LABEL[team.state]}
        </span>
      </button>

      {open && (
        <div className="bg-muted/30 space-y-3 px-3 pt-1 pb-3">
          {team.charges.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nobody has started a payment for this team yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {team.charges.map((c) => {
                const canRefund = refundableCents(c) > 0;
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {c.payerName ?? c.payerEmail ?? "Whole team"}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatCents(c.totalCents, currency)} ·{" "}
                        {c.status === "paid" && c.refundedCents > 0
                          ? `part refunded (${formatCents(c.refundedCents, currency)})`
                          : c.status}
                      </span>
                    </span>
                    {canRefund && (
                      <RefundDialog
                        paymentId={c.id}
                        payerLabel={c.payerEmail ?? team.teamName}
                        refundableCents={refundableCents(c)}
                        currency={currency}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/*
            A stalled split leaves several payers to unwind. Doing that one
            dialog at a time is where somebody gets missed.
          */}
          {refundableCount > 1 && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  Refund all {refundableCount} payers
                </Button>
              }
              title={`Refund everyone who paid for ${team.teamName}?`}
              description={`${refundableCount} payments go back to the cards they came from, in full. Your Stripe balance and our platform fee are both reduced in proportion. This can't be undone.`}
              confirmLabel="Refund everyone"
              onConfirm={refundEveryone}
            />
          )}

          {!withdrawn && team.outstandingPriceCents > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={sendLink}
                disabled={pending}
              >
                <Mail className="size-3.5" />
                Send payment link
              </Button>
              {isPending && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={admit}
                  disabled={pending}
                >
                  Admit anyway
                </Button>
              )}
            </div>
          )}

          {isPending && (
            <p className="text-muted-foreground text-xs">
              This team isn&apos;t in pools, schedules or standings until the
              fee is covered — or until you admit them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
