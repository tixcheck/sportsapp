/**
 * Turning "this team owes a registration fee" into the exact set of charges.
 *
 * Pure. The caller supplies the competition's settings, the platform rates in
 * force, and who is paying; this decides how many charges there are and what
 * each one costs. Keeping it here rather than inside the checkout action means
 * the money split is testable without Stripe, a DB, or a browser.
 */

import { quotePayment, splitEvenly, type StripeRate } from "./fees";
import {
  platformFeeCentsFor,
  type CompetitionType,
  type PayerMode,
  type PlatformFeeRates,
} from "./platform-fee";

export type RegistrationPricing = {
  /** What the organizer nets per TEAM, excluding tax. */
  registrationFeeCents: number;
  taxEnabled: boolean;
  /** Percent, e.g. 13 for Ontario HST. */
  taxPercent: number;
};

/** One charge to create at Stripe. */
export type PlannedCharge = {
  kind: "team_full" | "player_share";
  /** Roster email this share belongs to; null for a whole-team charge. */
  payerEmail: string | null;
  /** Organizer's net for this charge, excluding tax. */
  priceCents: number;
  taxCents: number;
  platformFeeCents: number;
  /** What this payer is charged. */
  totalCents: number;
  applicationFeeCents: number;
};

/**
 * Tax is charged on the organizer's price, not on the fees layered on top —
 * a platform fee isn't a taxable part of the registration, and taxing our cut
 * would overstate what the organizer has to remit.
 */
function taxFor(priceCents: number, pricing: RegistrationPricing): number {
  if (!pricing.taxEnabled || pricing.taxPercent <= 0) return 0;
  return Math.round((priceCents * pricing.taxPercent) / 100);
}

function chargeFor({
  kind,
  payerEmail,
  priceCents,
  pricing,
  competitionType,
  payerMode,
  rates,
  stripe,
}: {
  kind: PlannedCharge["kind"];
  payerEmail: string | null;
  priceCents: number;
  pricing: RegistrationPricing;
  competitionType: CompetitionType;
  payerMode: PayerMode;
  rates: PlatformFeeRates;
  stripe?: StripeRate;
}): PlannedCharge {
  const taxCents = taxFor(priceCents, pricing);
  const platformFeeCents = platformFeeCentsFor({
    competitionType,
    payerMode,
    chargeBaseCents: priceCents,
    rates,
  });
  const quote = quotePayment({
    priceCents,
    platformFeeCents,
    taxCents,
    stripe,
  });

  return {
    kind,
    payerEmail,
    priceCents,
    taxCents,
    platformFeeCents,
    totalCents: quote.totalCents,
    applicationFeeCents: quote.applicationFeeCents,
  };
}

/**
 * The charges for a team paying its whole fee in one go.
 *
 * Returns an empty array for a free event — no charge, nothing to pay, rather
 * than a zero-amount Stripe session that would fail anyway.
 */
export function planTeamCharge({
  pricing,
  competitionType,
  rates,
  stripe,
}: {
  pricing: RegistrationPricing;
  competitionType: CompetitionType;
  rates: PlatformFeeRates;
  stripe?: StripeRate;
}): PlannedCharge[] {
  if (pricing.registrationFeeCents <= 0) return [];
  return [
    chargeFor({
      kind: "team_full",
      payerEmail: null,
      priceCents: pricing.registrationFeeCents,
      pricing,
      competitionType,
      payerMode: "captain_pays_team",
      rates,
      stripe,
    }),
  ];
}

/**
 * The charges for a team splitting its fee across named payers.
 *
 * The team price is split first and each share priced separately, because the
 * platform fee for a split is per-payer — pricing the team then dividing the
 * total would smear our per-player fee across shares and stop each share from
 * standing on its own as a chargeable amount.
 *
 * Payer emails are deduplicated and order is preserved: `splitEvenly` gives
 * remainder cents to the earliest payers, so a stable order keeps the same
 * person paying the extra cent across repeated calls.
 */
export function planSplitCharges({
  pricing,
  competitionType,
  payerEmails,
  rates,
  stripe,
}: {
  pricing: RegistrationPricing;
  competitionType: CompetitionType;
  payerEmails: string[];
  rates: PlatformFeeRates;
  stripe?: StripeRate;
}): PlannedCharge[] {
  if (pricing.registrationFeeCents <= 0) return [];

  const seen = new Set<string>();
  const payers: string[] = [];
  for (const raw of payerEmails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    payers.push(email);
  }
  if (payers.length === 0) return [];

  const shares = splitEvenly(pricing.registrationFeeCents, payers.length);
  return payers.map((email, i) =>
    chargeFor({
      kind: "player_share",
      payerEmail: email,
      priceCents: shares[i],
      pricing,
      competitionType,
      payerMode: "player_share",
      rates,
      stripe,
    }),
  );
}

export type PaymentRowLike = {
  status: "pending" | "paid" | "cancelled" | "refunded";
  priceCents: number;
};

export type TeamPaymentState = {
  state: "free" | "unpaid" | "partial" | "paid";
  /** Organizer's net actually collected so far, excluding tax. */
  paidPriceCents: number;
  /** Organizer's net still outstanding. */
  outstandingPriceCents: number;
  /** How many shares are still to be paid (0 for a settled or free team). */
  chargesOutstanding: number;
};

/**
 * Where a team stands on its registration fee.
 *
 * Derived from the payment rows, never stored — the same rule as standings.
 * `cancelled` rows are ignored (an abandoned checkout isn't a debt) and
 * `refunded` rows count as unpaid again, because a refunded registration is one
 * the organizer no longer has the money for.
 *
 * A team with no rows on a priced event reads `unpaid`, not `free`: rows are
 * created when someone starts checkout, so their absence means nobody has
 * begun, which is exactly the state an organizer needs to chase.
 */
export function teamPaymentState(
  rows: PaymentRowLike[],
  { feeCents }: { feeCents: number },
): TeamPaymentState {
  if (feeCents <= 0) {
    return {
      state: "free",
      paidPriceCents: 0,
      outstandingPriceCents: 0,
      chargesOutstanding: 0,
    };
  }

  const live = rows.filter((r) => r.status !== "cancelled");
  const paid = live.filter((r) => r.status === "paid");
  const paidPriceCents = paid.reduce((sum, r) => sum + r.priceCents, 0);
  const outstandingPriceCents = Math.max(0, feeCents - paidPriceCents);

  // Compare against the fee rather than counting rows: an organizer can accept
  // a partial payment and the team is still short until the fee is covered.
  const state =
    outstandingPriceCents === 0
      ? "paid"
      : paidPriceCents > 0
        ? "partial"
        : "unpaid";

  return {
    state,
    paidPriceCents,
    outstandingPriceCents,
    chargesOutstanding: live.filter((r) => r.status !== "paid").length,
  };
}
