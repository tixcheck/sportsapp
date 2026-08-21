/**
 * Deriving "can this organizer get paid yet?" from Stripe's capability flags.
 *
 * Stripe hands us four booleans and a reason string; organizers need one clear
 * answer and one clear next step. Pure function, no DB or Stripe access — the
 * caller passes the `payment_accounts` row (or null if the org never connected).
 */

/** The subset of a `payment_accounts` row this needs. */
export type ConnectAccountFlags = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirementsDueCount: number;
};

export type PaymentAccountState =
  /** No Stripe account exists for this org (in this Stripe mode). */
  | "not_connected"
  /** Account created, organizer hasn't finished Stripe's form. */
  | "onboarding"
  /** Form submitted; Stripe is still verifying. Nothing for us to do. */
  | "pending_review"
  /** Stripe blocked or is holding the account — the organizer must act. */
  | "restricted"
  /** Can take money, payouts not released yet (e.g. first-payout hold). */
  | "payouts_pending"
  /** Fully live: charges and payouts both enabled. */
  | "active";

export type PaymentAccountStatus = {
  state: PaymentAccountState;
  /** Whether we may route a registration charge to this account. */
  canAcceptPayments: boolean;
  /** Whether the organizer has something to do (drives the CTA in the UI). */
  needsAction: boolean;
  /** How many Stripe requirements are outstanding (0 when none). */
  outstandingRequirements: number;
};

/**
 * `disabledReason` is authoritative: Stripe sets it when an account is blocked
 * for a reason the organizer must clear, even if other flags still look fine.
 * Charges being enabled is what gates taking money — payouts can lag behind
 * (Stripe holds an account's first payout ~7–14 days) without stopping
 * registration, so `payouts_pending` still accepts payments.
 */
export function paymentAccountStatus(
  account: ConnectAccountFlags | null | undefined,
): PaymentAccountStatus {
  if (!account) {
    return {
      state: "not_connected",
      canAcceptPayments: false,
      needsAction: true,
      outstandingRequirements: 0,
    };
  }

  const outstanding = Math.max(0, account.requirementsDueCount);
  const base = {
    canAcceptPayments: account.chargesEnabled,
    outstandingRequirements: outstanding,
  };

  if (account.disabledReason) {
    return { ...base, state: "restricted", needsAction: true };
  }

  if (!account.detailsSubmitted) {
    return { ...base, state: "onboarding", needsAction: true };
  }

  if (!account.chargesEnabled) {
    // Details are in and Stripe hasn't blocked anything. Outstanding
    // requirements mean it's back on the organizer; otherwise Stripe is just
    // still looking at it and nagging would be wrong.
    return {
      ...base,
      state: outstanding > 0 ? "restricted" : "pending_review",
      needsAction: outstanding > 0,
    };
  }

  if (!account.payoutsEnabled) {
    return {
      ...base,
      state: "payouts_pending",
      needsAction: outstanding > 0,
    };
  }

  return { ...base, state: "active", needsAction: false };
}

/**
 * Why a payer can't pay this organizer by card, in words the payer can act on.
 *
 * The old copy said "hasn't finished setting up payouts" at every blocked
 * checkout, which was wrong in the common case and actively misleading: payouts
 * are NOT what gates taking money (see `canAcceptPayments` above — it reads
 * `chargesEnabled`, and `payouts_pending` still accepts payments). An organizer
 * who has simply never connected Stripe was being described as though they were
 * waiting on a bank verification, which sends everyone looking in the wrong
 * place.
 *
 * Returns null when payment is possible, so a caller can use it as the guard.
 */
export function cardPaymentBlockedReason(
  account: ConnectAccountFlags | null | undefined,
): string | null {
  const status = paymentAccountStatus(account);
  if (status.canAcceptPayments) return null;

  switch (status.state) {
    case "not_connected":
      return "This organizer hasn't set up card payments yet. Get in touch with them to arrange another way to pay.";
    case "onboarding":
      return "This organizer is part-way through setting up card payments. Get in touch with them to arrange another way to pay.";
    case "pending_review":
      return "Stripe is still reviewing this organizer's account, so card payment isn't available yet. It usually clears within a day or two.";
    case "restricted":
      return "Card payment isn't available for this organizer at the moment. Get in touch with them to arrange another way to pay.";
    default:
      return "Card payment isn't available for this organizer at the moment.";
  }
}
