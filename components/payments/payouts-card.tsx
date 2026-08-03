"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import type {
  PaymentAccountState,
  PaymentAccountStatus,
} from "@/lib/payments/account-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ConnectResult = { error: string } | { url: string };

/** Copy per state. Every pill carries a word — never colour alone (DESIGN.md). */
const COPY: Record<
  PaymentAccountState,
  { pill: string; tone: string; body: string; cta: string | null }
> = {
  not_connected: {
    pill: "Not set up",
    tone: "bg-paper-sunken text-ink-2",
    body: "Connect a Stripe account and players can pay their registration fee by card when they sign up. The money goes to your own bank — we never hold it.",
    cta: "Connect Stripe",
  },
  onboarding: {
    pill: "Unfinished",
    tone: "bg-amber-100 text-amber-800",
    body: "Stripe still needs a few details before you can take payments. Picking up where you left off takes a couple of minutes.",
    cta: "Finish on Stripe",
  },
  pending_review: {
    pill: "In review",
    tone: "bg-paper-sunken text-ink-2",
    body: "Stripe is reviewing your details. Nothing for you to do — this updates on its own once they're done.",
    cta: null,
  },
  restricted: {
    pill: "Needs attention",
    tone: "bg-amber-100 text-amber-800",
    body: "Stripe needs something from you before this account can be used.",
    cta: "Fix on Stripe",
  },
  payouts_pending: {
    pill: "Payouts pending",
    tone: "bg-amber-100 text-amber-800",
    body: "You can take registration payments now. Stripe holds every account's first payout for about 7–14 days, then pays out on a rolling basis.",
    cta: "View on Stripe",
  },
  active: {
    pill: "Ready",
    tone: "bg-emerald-100 text-emerald-800",
    body: "Registration payments land in your bank account. Stripe pays out on a rolling basis, usually about two business days after each payment.",
    cta: "Manage on Stripe",
  },
};

/**
 * The org's "Payments" section: where an organizer connects the Stripe account
 * their registration money is paid out to.
 *
 * Shown only to org admins. `connectAction` comes in pre-bound to the org id —
 * it returns Stripe's hosted onboarding URL, which we send the browser to. Until
 * the platform's Stripe keys exist it returns a message instead, which is why
 * the button surfaces the error rather than assuming a URL.
 */
export function PayoutsCard({
  status,
  configured,
  livemode,
  connectAction,
}: {
  status: PaymentAccountStatus;
  /** Whether this deployment has Stripe keys at all. */
  configured: boolean;
  /** false = running on Stripe test keys; say so out loud rather than imply real money. */
  livemode: boolean;
  connectAction: () => Promise<ConnectResult>;
}) {
  const [pending, start] = useTransition();
  const copy = COPY[status.state];

  function connect() {
    start(async () => {
      const res = await connectAction();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      // Stripe's onboarding is a hosted page — leave the app entirely.
      window.location.href = res.url;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CardTitle>Payments</CardTitle>
          <span
            className={`rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${copy.tone}`}
          >
            {copy.pill}
          </span>
          {!configured ? (
            <span className="bg-paper-sunken text-ink-2 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Not switched on yet
            </span>
          ) : (
            !livemode && (
              <span className="bg-paper-sunken text-ink-2 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                Test mode
              </span>
            )
          )}
        </div>
        <CardDescription>
          Collect registration fees online, paid out to your bank.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-ink-2 text-sm">{copy.body}</p>

        {status.outstandingRequirements > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Stripe is waiting on {status.outstandingRequirements}{" "}
            {status.outstandingRequirements === 1 ? "detail" : "details"}. The
            list is on Stripe&apos;s own page — we deliberately don&apos;t keep
            a copy.
          </p>
        )}

        {copy.cta && (
          <Button
            type="button"
            onClick={connect}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Opening Stripe…" : copy.cta}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
