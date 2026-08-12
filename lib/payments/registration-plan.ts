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

// ---------------------------------------------------------------------------
// Split payments (Slice B3)
// ---------------------------------------------------------------------------

export type ShareMember = {
  email: string;
  name: string;
  userId: string;
};

export type ExistingShare = {
  payerEmail: string | null;
  status: "pending" | "paid" | "cancelled" | "refunded";
  priceCents: number;
  totalCents: number;
};

export type MemberShare = {
  email: string;
  name: string;
  userId: string;
  /** paid = settled; pending = checkout open; owed = nothing started yet. */
  status: "paid" | "pending" | "owed";
  /** Organizer's net for this person's share. */
  priceCents: number;
  /** What they'd actually be charged, fees included. Null until quoted. */
  totalCents: number | null;
};

/**
 * Who owes what on a split team fee.
 *
 * Shares are recomputed over the members who haven't started paying, against
 * what's left of the fee — deliberately, because a roster changes. If a seventh
 * player joins after two have paid, re-dividing the *remainder* keeps the team
 * total correct without disturbing anyone already settled. Fixing shares up
 * front would either short the organizer or bill someone twice.
 *
 * A member with an existing row keeps that row's FROZEN amount: it's what they
 * were quoted and, if pending, what Stripe will actually charge them.
 */
export function planMemberShares({
  pricing,
  competitionType,
  rates,
  members,
  existingShares,
  stripe,
}: {
  pricing: RegistrationPricing;
  competitionType: CompetitionType;
  rates: PlatformFeeRates;
  members: ShareMember[];
  existingShares: ExistingShare[];
  stripe?: StripeRate;
}): MemberShare[] {
  if (pricing.registrationFeeCents <= 0 || members.length === 0) return [];

  // Abandoned checkouts aren't debts and mustn't hold a share hostage.
  const live = existingShares.filter((s) => s.status !== "cancelled");
  const byEmail = new Map<string, ExistingShare>();
  for (const s of live) {
    const email = s.payerEmail?.trim().toLowerCase();
    // A refund reopens the share, so a later `paid`/`pending` row wins.
    if (!email) continue;
    const existing = byEmail.get(email);
    if (!existing || rank(s.status) > rank(existing.status)) {
      byEmail.set(email, s);
    }
  }

  const settled = [...byEmail.values()].filter(
    (s) => s.status === "paid" || s.status === "pending",
  );
  const committedCents = settled.reduce((sum, s) => sum + s.priceCents, 0);
  const remainingCents = Math.max(
    0,
    pricing.registrationFeeCents - committedCents,
  );

  const unstarted = members.filter((m) => {
    const row = byEmail.get(m.email.trim().toLowerCase());
    return !row || (row.status !== "paid" && row.status !== "pending");
  });

  const shares =
    unstarted.length > 0 ? splitEvenly(remainingCents, unstarted.length) : [];
  const shareByEmail = new Map(
    unstarted.map((m, i) => [m.email.trim().toLowerCase(), shares[i]]),
  );

  return members.map((m) => {
    const key = m.email.trim().toLowerCase();
    const row = byEmail.get(key);

    if (row?.status === "paid" || row?.status === "pending") {
      return {
        email: m.email,
        name: m.name,
        userId: m.userId,
        status: row.status === "paid" ? "paid" : "pending",
        priceCents: row.priceCents,
        totalCents: row.totalCents,
      };
    }

    const priceCents = shareByEmail.get(key) ?? 0;
    const quoted =
      priceCents > 0
        ? quotePayment({
            priceCents,
            platformFeeCents: platformFeeCentsFor({
              competitionType,
              payerMode: "player_share",
              chargeBaseCents: priceCents,
              rates,
            }),
            taxCents: taxFor(priceCents, pricing),
            stripe,
          })
        : null;

    return {
      email: m.email,
      name: m.name,
      userId: m.userId,
      status: "owed" as const,
      priceCents,
      totalCents: quoted?.totalCents ?? null,
    };
  });
}

/** paid beats pending beats anything reopened. */
function rank(status: ExistingShare["status"]): number {
  if (status === "paid") return 3;
  if (status === "pending") return 2;
  return 1;
}
