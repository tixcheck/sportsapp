"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { currentStripeMode } from "@/lib/payments/stripe-mode";

type ActionError = { error: string };

const orgIdSchema = z.string().uuid("Unknown organization.");

/**
 * Start (or resume) Stripe Express onboarding for an org, returning the hosted
 * onboarding URL for the browser to visit.
 *
 * ── Not wired yet ──────────────────────────────────────────────────────────
 * The Stripe SDK isn't installed and the platform's keys haven't been issued,
 * so this returns a plain "not switched on" message and the UI renders a
 * disabled state. Everything AROUND the Stripe call is real: auth, the org-admin
 * check, the mode read, and the contract with the client component.
 *
 * When the keys land, the body between the guards becomes:
 *   1. reuse `link_payment_account`'s returned acct id, or create an Express
 *      account (country CA, capabilities: card_payments + transfers) and pass
 *      the new id to the rpc — which returns the EXISTING id if another tab
 *      already made one, in which case discard the account just created;
 *   2. `stripe.accountLinks.create({ account, type: 'account_onboarding',
 *      refresh_url, return_url })`;
 *   3. return that url.
 * No other file should need to change.
 */
export async function startPayoutsOnboardingAction(
  orgId: string,
): Promise<ActionError | { url: string }> {
  const parsed = orgIdSchema.safeParse(orgId);
  if (!parsed.success) return { error: "Unknown organization." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  // Defense in depth — link_payment_account enforces this again in the DB.
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an organization admin can set up payouts." };
  }

  const mode = currentStripeMode();
  if (!mode.configured) {
    return {
      error:
        "Online payments aren't switched on yet. Check back once setup is finished.",
    };
  }

  return {
    error: "Payouts onboarding isn't finished yet — hang tight.",
  };
}
