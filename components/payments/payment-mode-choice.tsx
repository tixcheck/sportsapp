"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { quotePayment, splitEvenly } from "@/lib/payments/fees";
import {
  platformFeeCentsFor,
  DEFAULT_PLATFORM_FEE_RATES,
} from "@/lib/payments/platform-fee";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export type PaymentMode = "team_full" | "player_share";

/**
 * How the captain wants to settle the team fee.
 *
 * Shown only when the organizer allows both. The point is the numbers: a
 * captain choosing between "pay $364" and "everyone pays $63" needs to see both
 * before deciding, not after being redirected to Stripe.
 *
 * The figures use the shipped default rates — the server recomputes from the
 * live ones when the charge is actually created, so this is a preview, and the
 * copy says "about" rather than implying a quote.
 */
export function PaymentModeChoice({
  teamCents,
  players,
  value,
  onChange,
}: {
  teamCents: number;
  /** How many roster emails were filled in — the likely number of payers. */
  players: number;
  value: PaymentMode;
  onChange: (v: PaymentMode) => void;
}) {
  const captainQuote = quotePayment({
    priceCents: teamCents,
    platformFeeCents: platformFeeCentsFor({
      competitionType: "tournament",
      payerMode: "captain_pays_team",
      chargeBaseCents: teamCents,
      rates: DEFAULT_PLATFORM_FEE_RATES,
    }),
  });

  // At least one payer, or the split preview divides by zero.
  const payers = Math.max(1, players);
  const shares = splitEvenly(teamCents, payers);
  const shareQuote = quotePayment({
    priceCents: shares[0],
    platformFeeCents: platformFeeCentsFor({
      competitionType: "tournament",
      payerMode: "player_share",
      chargeBaseCents: shares[0],
      rates: DEFAULT_PLATFORM_FEE_RATES,
    }),
  });

  const options: {
    id: PaymentMode;
    label: string;
    detail: string;
    amount: string;
  }[] = [
    {
      id: "team_full",
      label: "I'll pay for the team",
      detail: "One payment now. Your spot is confirmed straight away.",
      amount: `about ${money(captainQuote.totalCents)}`,
    },
    {
      id: "player_share",
      label: "Everyone pays their own share",
      detail: `Split ${payers === 1 ? "once more players join" : `${payers} ways`}. The team is confirmed once every share is in.`,
      amount: `about ${money(shareQuote.totalCents)} each`,
    },
  ];

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        How will you pay the {money(teamCents)} fee?
      </p>

      {options.map((o) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
              selected
                ? "border-primary bg-accent"
                : "border-border bg-surface hover:bg-muted",
            )}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="text-muted-foreground block text-xs">
                {o.detail}
              </span>
              <span className="mt-1 block text-sm font-semibold tabular-nums">
                {o.amount}
              </span>
            </span>
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {selected && <Check className="size-3.5" />}
            </span>
          </button>
        );
      })}

      <p className="text-muted-foreground text-xs">
        Card and platform fees are included in these amounts. The organizer
        receives {money(teamCents)} either way.
      </p>
    </div>
  );
}
