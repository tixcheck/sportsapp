"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { refundRegistrationPaymentAction } from "@/server/actions/organizer-payments";
import { formatCents } from "@/lib/payments/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Give a payer their money back.
 *
 * Defaults to the full remaining amount, because that's what a refund almost
 * always means — the partial box is there for the "we kept the $10 late fee"
 * case, not as the common path. The amount is re-validated on the server
 * against the charge, so nothing typed here can refund more than was taken.
 */
export function RefundDialog({
  paymentId,
  payerLabel,
  refundableCents,
  currency,
}: {
  paymentId: string;
  /** Who is getting the money — an email, or the team for a team_full charge. */
  payerLabel: string;
  refundableCents: number;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState((refundableCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const amountCents = Math.round(Number(amount) * 100);
  const amountValid =
    full ||
    (Number.isFinite(amountCents) &&
      amountCents > 0 &&
      amountCents <= refundableCents);

  function submit() {
    start(async () => {
      const res = await refundRegistrationPaymentAction({
        paymentId,
        amountCents: full ? undefined : amountCents,
        reason: reason.trim() || undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${formatCents(res.refundedCents, currency)} refunded. It reaches their card in 5–10 days.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {payerLabel}</DialogTitle>
          <DialogDescription>
            Up to {formatCents(refundableCents, currency)} can go back. Your
            Stripe balance and our platform fee are both reduced in proportion —
            you aren&apos;t refunding out of your own pocket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={full ? "default" : "outline"}
              size="sm"
              onClick={() => setFull(true)}
            >
              Refund all {formatCents(refundableCents, currency)}
            </Button>
            <Button
              type="button"
              variant={full ? "outline" : "default"}
              size="sm"
              onClick={() => setFull(false)}
            >
              Part of it
            </Button>
          </div>

          {!full && (
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountValid}
              />
              {!amountValid && (
                <p className="text-destructive text-xs">
                  Enter an amount between $0.01 and{" "}
                  {formatCents(refundableCents, currency)}.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason (optional)</Label>
            <Input
              id="refund-reason"
              placeholder="Team withdrew before the deadline"
              value={reason}
              maxLength={280}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Included in the email they get, so they know what it&apos;s for.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !amountValid}>
            {pending ? "Refunding…" : "Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
