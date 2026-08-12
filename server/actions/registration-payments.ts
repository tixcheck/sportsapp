"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { currentStripeMode } from "@/lib/payments/stripe-mode";
import { getStripe } from "@/lib/payments/stripe";
import {
  getCompetitionPaymentSettings,
  getPaymentAccount,
  getPlatformFeeRates,
} from "@/lib/queries/payments";
import { paymentAccountStatus } from "@/lib/payments/account-status";
import { planTeamCharge } from "@/lib/payments/registration-plan";
import type { CompetitionType } from "@/lib/payments/platform-fee";
import { getOrigin } from "@/lib/utils/url";

type ActionError = { error: string };

const idSchema = z.string().uuid();

/** Stripe's failures read the same to a payer: try again, and if it keeps
 *  failing it's ours to fix. Their messages name API parameters, which is
 *  noise to a captain trying to pay $480. */
const STRIPE_FAILED =
  "We couldn't reach Stripe just now. Please try again in a moment.";

/**
 * Send a team's captain to Stripe Checkout to pay the registration fee in full.
 *
 * The amounts are recomputed here from the competition's stored settings and
 * the live platform rates — never taken from the client. The UI quotes the
 * same numbers through the same pure functions, so what the captain saw is what
 * they're charged, but the server is the one that decides.
 *
 * Idempotent: `start_registration_payment` returns the EXISTING open charge if
 * there is one, so a double-clicked button resumes the same session rather than
 * billing twice. If we lose that race we expire the session we just made.
 */
export async function startRegistrationCheckoutAction(
  competitionId: string,
  teamId: string,
): Promise<ActionError | { url: string }> {
  const comp = idSchema.safeParse(competitionId);
  const team = idSchema.safeParse(teamId);
  if (!comp.success || !team.success) return { error: "Unknown team." };

  const mode = currentStripeMode();
  if (!mode.configured) {
    return { error: "Online payments aren't switched on yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to pay." };

  // The competition tells us how to price this; the org tells us where the
  // money goes. Both are read server-side under RLS.
  const { data: competition } = await supabase
    .from("competitions")
    .select("id, org_id, type, name")
    .eq("id", comp.data)
    .maybeSingle();
  if (!competition) return { error: "Unknown competition." };
  const c = competition as {
    id: string;
    org_id: string;
    type: CompetitionType;
    name: string;
  };

  const [settings, rates, account] = await Promise.all([
    getCompetitionPaymentSettings(c.id),
    getPlatformFeeRates(),
    getPaymentAccount(c.org_id),
  ]);

  if (settings.registrationFeeCents <= 0) {
    return { error: "This event is free — there's nothing to pay." };
  }
  if (!settings.allowCaptainPays) {
    return {
      error: "This event asks each player to pay their own share.",
    };
  }
  if (!account || !paymentAccountStatus(account).canAcceptPayments) {
    return {
      error:
        "The organizer hasn't finished setting up payouts, so card payments aren't available yet.",
    };
  }

  const [charge] = planTeamCharge({
    pricing: {
      registrationFeeCents: settings.registrationFeeCents,
      taxEnabled: settings.taxEnabled,
      taxPercent: settings.taxPercent,
    },
    competitionType: c.type,
    rates,
  });
  if (!charge) return { error: "This event is free — there's nothing to pay." };

  const stripe = getStripe();
  const origin = await getOrigin();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Prefill so the receipt reaches the person actually paying.
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: charge.totalCents,
            product_data: {
              name: `${c.name} — team registration`,
              description:
                charge.taxCents > 0
                  ? "Includes tax, card and platform fees."
                  : "Includes card and platform fees.",
            },
          },
        },
      ],
      payment_intent_data: {
        // A destination charge: Stripe settles to the organizer's connected
        // account and routes our cut to the platform in the same movement, so
        // the platform never holds the organizer's money.
        application_fee_amount: charge.applicationFeeCents,
        transfer_data: { destination: account.stripeAccountId },
      },
      // The webhook matches on the session id, but this makes a Stripe
      // dashboard row readable without cross-referencing our database.
      metadata: {
        competition_id: c.id,
        team_id: team.data,
        kind: "team_full",
      },
      success_url: `${origin}/teams/${team.data}?paid=1`,
      cancel_url: `${origin}/teams/${team.data}?paid=0`,
    });

    if (!session.url) {
      console.error("[payments] checkout session had no url");
      return { error: STRIPE_FAILED };
    }

    const { data: storedSessionId, error } = await supabase.rpc(
      "start_registration_payment",
      {
        _competition_id: c.id,
        _team_id: team.data,
        _kind: "team_full",
        _payer_email: null,
        _price_cents: charge.priceCents,
        _tax_cents: charge.taxCents,
        _platform_fee_cents: charge.platformFeeCents,
        _total_cents: charge.totalCents,
        _application_fee_cents: charge.applicationFeeCents,
        _stripe_account_id: account.stripeAccountId,
        _livemode: mode.livemode,
        _session_id: session.id,
      },
    );

    if (error || typeof storedSessionId !== "string") {
      // Our session is now orphaned; expiring it keeps the organizer's Stripe
      // dashboard from filling with sessions nobody can pay.
      await expireQuietly(session.id);
      const message = error?.message ?? "";
      if (message.includes("Only the team or the organizer")) {
        return { error: "Only the team or the organizer can pay this." };
      }
      console.error("[payments] start_registration_payment failed");
      return { error: STRIPE_FAILED };
    }

    if (storedSessionId !== session.id) {
      // Another tab already opened a charge. Use theirs and drop ours.
      await expireQuietly(session.id);
      const existing = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (existing.status === "open" && existing.url) {
        return { url: existing.url };
      }
      // Their session is dead — retire the row so the next click starts clean.
      await supabase.rpc("cancel_registration_payment", {
        _session_id: storedSessionId,
      });
      return {
        error: "That payment link expired. Please try again.",
      };
    }

    return { url: session.url };
  } catch {
    console.error("[payments] checkout session create failed");
    return { error: STRIPE_FAILED };
  }
}

/** Best-effort cleanup — a leftover open session is untidy, not dangerous. */
async function expireQuietly(sessionId: string): Promise<void> {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
  } catch {
    console.error("[payments] could not expire redundant checkout session");
  }
}
