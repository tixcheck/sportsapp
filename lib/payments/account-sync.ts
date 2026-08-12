/**
 * Turning a Stripe `Account` into the columns `payment_accounts` stores.
 *
 * Pure — no Stripe client, no DB. The webhook fetches the account and hands the
 * object here, which is what makes the mapping testable against the shapes
 * Stripe actually sends (including the half-populated ones it sends early in
 * onboarding).
 *
 * We deliberately keep a COUNT of outstanding requirements, never the list:
 * requirement keys name individuals ("person_xxx.verification.document") and
 * carry PII we have no reason to hold. The list lives on Stripe's own page,
 * which is where we send the organizer anyway.
 */

/** The subset of Stripe's `Account` we read. Loose on purpose — every field is
 *  optional in Stripe's types, and an account mid-onboarding omits most. */
export type StripeAccountLike = {
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
  country?: string | null;
  default_currency?: string | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
    disabled_reason?: string | null;
  } | null;
};

export type PaymentAccountUpdate = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  disabled_reason: string | null;
  requirements_due_count: number;
  country: string;
  default_currency: string;
  onboarded_at: string | null;
  updated_at: string;
};

/**
 * `past_due` is a subset of `currently_due` in Stripe's model, but treating
 * that as guaranteed would let a stray past_due entry go uncounted. Union the
 * two and dedupe: the number an organizer sees should never undercount what
 * Stripe is actually waiting for.
 */
function outstandingCount(
  requirements: StripeAccountLike["requirements"],
): number {
  if (!requirements) return 0;
  const due = new Set<string>([
    ...(requirements.currently_due ?? []),
    ...(requirements.past_due ?? []),
  ]);
  return due.size;
}

export function accountUpdateFromStripe(
  account: StripeAccountLike,
  {
    existingOnboardedAt,
    now,
  }: { existingOnboardedAt: string | null; now: string },
): PaymentAccountUpdate {
  const detailsSubmitted = account.details_submitted === true;

  return {
    charges_enabled: account.charges_enabled === true,
    payouts_enabled: account.payouts_enabled === true,
    details_submitted: detailsSubmitted,
    // Stripe hangs the block reason off `requirements`, not the account root.
    disabled_reason: account.requirements?.disabled_reason ?? null,
    requirements_due_count: outstandingCount(account.requirements),
    // Stripe echoes these back once the account exists; before then the row's
    // own defaults (CA/cad) are the better answer than an empty string.
    country: account.country?.trim() || "CA",
    default_currency: account.default_currency?.trim().toLowerCase() || "cad",
    // First time the organizer finished Stripe's form — a milestone, so it
    // must not move if Stripe later re-opens requirements on the account.
    onboarded_at: existingOnboardedAt ?? (detailsSubmitted ? now : null),
    updated_at: now,
  };
}
