"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { confirmOfflinePaymentAction } from "@/server/actions/organizer-payments";
import type {
  OfflineFeesOwed,
  PendingOfflinePayment,
} from "@/lib/queries/payments";
import { formatCents } from "@/lib/payments/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const METHOD_LABEL: Record<PendingOfflinePayment["method"], string> = {
  etransfer: "e-transfer",
  paypal: "PayPal",
};

/**
 * The organizer's to-do list for money that moved without us.
 *
 * There is no webhook for a bank transfer, and none for a PayPal payment link
 * either — the link is created once in the organizer's own PayPal dashboard,
 * shared by every team, and carries no reference back to a registration. So
 * this screen is the only place either can be settled, and the organizer
 * checking their own account is the only evidence that exists.
 *
 * Each row asks for an AMOUNT rather than offering a tick: part payments are
 * ordinary, and recording "they paid" when $50 of $350 arrived would admit a
 * team that hasn't paid. The amount is pre-filled with what was asked for,
 * because that is right most of the time.
 */
export function OfflinePaymentsInbox({
  pending,
  feesOwed,
}: {
  pending: PendingOfflinePayment[];
  feesOwed: OfflineFeesOwed;
}) {
  if (pending.length === 0 && feesOwed.payments === 0) return null;

  const methods = [...new Set(pending.map((p) => p.method))];
  const title =
    methods.length === 1 ? METHOD_LABEL[methods[0]] : "Offline payments";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{title}</CardTitle>
        <CardDescription>
          {pending.length > 0
            ? `${pending.length} team${pending.length === 1 ? "" : "s"} said they've paid. Check your own account and confirm what actually arrived — the team isn't confirmed until you do.`
            : "Nothing waiting to be confirmed."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {pending.length > 0 && (
          <ul className="divide-rule divide-y">
            {pending.map((p) => (
              <OfflineRow key={p.paymentId} row={p} />
            ))}
          </ul>
        )}

        {feesOwed.payments > 0 && (
          <div className="border-border bg-paper-sunken rounded-lg border p-3">
            <p className="text-sm font-medium">
              Platform fees owed: {formatCents(feesOwed.feeCents)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              On {feesOwed.payments} confirmed payment
              {feesOwed.payments === 1 ? "" : "s"} we never handled, so our fee
              couldn&apos;t come out of it — we&apos;ll invoice these
              separately.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OfflineRow({ row }: { row: PendingOfflinePayment }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(row.expectedCents / 100));
  const [note, setNote] = useState("");

  function confirm() {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast.error("Enter the amount that arrived.");
      return;
    }
    start(async () => {
      const res = await confirmOfflinePaymentAction({
        paymentId: row.paymentId,
        amountDollars: dollars,
        note: note || undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.teamAdmitted
          ? `${row.teamName} is confirmed and in.`
          : `Recorded. ${row.teamName} still owes the rest.`,
      );
      router.refresh();
    });
  }

  return (
    <li className="grid gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {row.teamName}
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            {row.isIndividual ? "individual · " : ""}
            by {METHOD_LABEL[row.method]}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          asked for {formatCents(row.expectedCents)}
          {row.payerEmail ? ` · ${row.payerEmail}` : ""}
        </p>
      </div>

      {/* Their word for it, and labelled as their word for it. Presenting an
          unverified transaction ID as though we had checked it is exactly the
          mistake this whole flow is built to avoid. */}
      {row.payerReference && (
        <p className="text-muted-foreground text-xs">
          They say the reference is{" "}
          <span className="text-ink font-mono">{row.payerReference}</span> — not
          checked by us.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">Amount received</span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-sm">$</span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="max-w-28 tabular-nums"
              aria-label={`Amount received from ${row.teamName}`}
            />
          </div>
        </label>

        <label className="grid flex-1 gap-1">
          <span className="text-muted-foreground text-xs">Note (optional)</span>
          <Input
            placeholder="Reference number, or who sent it"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <Button onClick={confirm} disabled={pending} size="sm">
          <Check className="size-4" />
          {pending ? "Saving…" : "Confirm received"}
        </Button>
      </div>
    </li>
  );
}
