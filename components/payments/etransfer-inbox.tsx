"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { confirmEtransferAction } from "@/server/actions/organizer-payments";
import type {
  EtransferFeesOwed,
  PendingEtransfer,
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

/**
 * The organizer's e-transfer to-do list.
 *
 * There is no webhook for money that moved between two banks, so this is the
 * only way a transfer is ever settled. Each row asks for an AMOUNT rather than
 * offering a tick: part payments are ordinary, and recording "they paid" when
 * $50 of $350 arrived would admit a team that hasn't paid.
 *
 * The amount is pre-filled with what was asked for, because that is right most
 * of the time and retyping it would be busywork.
 */
export function EtransferInbox({
  pending,
  feesOwed,
}: {
  pending: PendingEtransfer[];
  feesOwed: EtransferFeesOwed;
}) {
  if (pending.length === 0 && feesOwed.payments === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-transfers</CardTitle>
        <CardDescription>
          {pending.length > 0
            ? `${pending.length} team${pending.length === 1 ? "" : "s"} said they've sent a transfer. Confirm what actually landed in your account — the team isn't confirmed until you do.`
            : "Nothing waiting to be confirmed."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {pending.length > 0 && (
          <ul className="divide-rule divide-y">
            {pending.map((p) => (
              <EtransferRow key={p.paymentId} row={p} />
            ))}
          </ul>
        )}

        {feesOwed.payments > 0 && (
          <div className="border-border bg-paper-sunken rounded-lg border p-3">
            <p className="text-sm font-medium">
              Platform fees owed: {formatCents(feesOwed.feeCents)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              On {feesOwed.payments} confirmed e-transfer
              {feesOwed.payments === 1 ? "" : "s"}. We never handled this money,
              so our fee couldn&apos;t come out of it — we&apos;ll invoice these
              separately.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EtransferRow({ row }: { row: PendingEtransfer }) {
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
      const res = await confirmEtransferAction({
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
        <p className="text-sm font-semibold">{row.teamName}</p>
        <p className="text-muted-foreground text-xs">
          asked for {formatCents(row.expectedCents)}
          {row.payerEmail ? ` · ${row.payerEmail}` : ""}
        </p>
      </div>

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
