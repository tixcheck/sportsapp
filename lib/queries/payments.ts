import { createClient } from "@/lib/supabase/server";
import type { ConnectAccountFlags } from "@/lib/payments/account-status";
import { currentStripeMode } from "@/lib/payments/stripe-mode";

export interface PaymentAccountRow extends ConnectAccountFlags {
  id: string;
  stripeAccountId: string;
  country: string;
  defaultCurrency: string;
  onboardedAt: string | null;
}

type PaymentAccountRecord = {
  id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  disabled_reason: string | null;
  requirements_due_count: number;
  country: string;
  default_currency: string;
  onboarded_at: string | null;
};

const COLUMNS =
  "id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, disabled_reason, requirements_due_count, country, default_currency, onboarded_at";

/**
 * An org's connected account for the mode this deployment is running in, or
 * null. Scoped to the current Stripe mode on purpose: showing a test account's
 * "ready to take payments" badge on a live deployment would be a lie, and RLS
 * already limits the read to the org's own admins.
 */
export async function getPaymentAccount(
  orgId: string,
): Promise<PaymentAccountRow | null> {
  const mode = currentStripeMode();
  if (!mode.configured) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_accounts")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .eq("livemode", mode.livemode)
    .maybeSingle();
  if (!data) return null;

  const r = data as PaymentAccountRecord;
  return {
    id: r.id,
    stripeAccountId: r.stripe_account_id,
    chargesEnabled: r.charges_enabled,
    payoutsEnabled: r.payouts_enabled,
    detailsSubmitted: r.details_submitted,
    disabledReason: r.disabled_reason,
    requirementsDueCount: r.requirements_due_count,
    country: r.country,
    defaultCurrency: r.default_currency,
    onboardedAt: r.onboarded_at,
  };
}
