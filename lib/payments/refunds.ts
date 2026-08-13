/**
 * What a refund gives back, and to whom.
 *
 * A registration charge is a Stripe DESTINATION charge: one payment splits
 * three ways — the organizer's price, the tax they remit, and the platform's
 * application fee. Refunding it with `reverse_transfer` and
 * `refund_application_fee` makes Stripe pull each cut back IN PROPORTION to the
 * refunded amount. These functions mirror that arithmetic so our ledger and
 * Stripe's dashboard never disagree.
 *
 * Everything here is pure and in integer CENTS, for the same reason as
 * `fees.ts`: this decides what an organizer is owed.
 */

/** The subset of a `registration_payments` row this module reasons about. */
export type RefundableCharge = {
  status: "pending" | "paid" | "cancelled" | "refunded";
  /** What the payer was charged. */
  totalCents: number;
  /** Organizer's net, excluding tax. */
  priceCents: number;
  taxCents: number;
  /** The platform's cut. `price + tax + applicationFee === total`, always. */
  applicationFeeCents: number;
  /** Cumulative amount already handed back. */
  refundedCents: number;
};

export type RefundBreakdown = {
  /** Total handed back to the payer. */
  refundCents: number;
  /** Comes out of the organizer's price. */
  priceCents: number;
  /** Comes out of the tax they were going to remit. */
  taxCents: number;
  /** Comes out of the platform's application fee. */
  applicationFeeCents: number;
};

function assertCharge(charge: RefundableCharge): void {
  const { priceCents, taxCents, applicationFeeCents, totalCents } = charge;
  for (const [name, v] of [
    ["totalCents", totalCents],
    ["priceCents", priceCents],
    ["taxCents", taxCents],
    ["applicationFeeCents", applicationFeeCents],
    ["refundedCents", charge.refundedCents],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`${name} must be a non-negative integer of cents.`);
    }
  }
  if (priceCents + taxCents + applicationFeeCents !== totalCents) {
    // The same invariant the DB check constraint enforces. If it's broken here
    // the row is corrupt, and guessing which field is wrong would be worse.
    throw new Error(
      "Charge does not balance: price + tax + fee must equal total.",
    );
  }
}

/**
 * How much of this charge can still be handed back.
 *
 * Only a charge that actually collected money can be refunded — a `pending`
 * row is an abandoned checkout, and a `cancelled` one never took anything.
 * A row already marked `refunded` can still have room if the earlier refund
 * was partial, so this measures the remainder rather than the status.
 */
export function refundableCents(charge: RefundableCharge): number {
  assertCharge(charge);
  if (charge.status === "pending" || charge.status === "cancelled") return 0;
  return Math.max(0, charge.totalCents - charge.refundedCents);
}

/**
 * Split a refund back across the three cuts, the way Stripe does.
 *
 * The platform's share is computed pro rata and the organizer's is taken as
 * the REMAINDER, so the three parts always add back to exactly `refundCents`.
 * Deriving one part by subtraction is the only way to keep that true under
 * rounding — three independent `round()` calls can miss by a cent, and a cent
 * that belongs to nobody is a reconciliation bug six months later.
 *
 * Sub-cent rounding therefore lands on the ORGANIZER here, which is the
 * opposite of `quotePayment` (where it lands on the platform). That's
 * deliberate and in the payer's favour in both directions: we round the charge
 * up and the refund's platform-portion down, so we never keep a cent we didn't
 * earn.
 */
export function refundBreakdown(
  charge: RefundableCharge,
  refundCents: number,
): RefundBreakdown {
  assertCharge(charge);
  if (!Number.isInteger(refundCents) || refundCents <= 0) {
    throw new Error("refundCents must be a positive integer of cents.");
  }
  const available = refundableCents(charge);
  if (refundCents > available) {
    throw new Error(
      `Cannot refund ${refundCents} cents; only ${available} remain on this charge.`,
    );
  }

  // A zero-total charge can't reach here (refundCents > 0 implies available > 0
  // implies total > 0), so this division is always safe.
  const applicationFeeCents = Math.round(
    (charge.applicationFeeCents * refundCents) / charge.totalCents,
  );
  const taxCents = Math.round(
    (charge.taxCents * refundCents) / charge.totalCents,
  );
  const priceCents = refundCents - applicationFeeCents - taxCents;

  return { refundCents, priceCents, taxCents, applicationFeeCents };
}

/**
 * The organizer's net that this charge has actually delivered, after refunds.
 *
 * This — not `priceCents` — is what a payments dashboard should total, and
 * what decides whether a team's fee is still covered. A fully refunded
 * registration has delivered nothing, however "paid" it once was.
 */
export function netPriceCents(charge: RefundableCharge): number {
  assertCharge(charge);
  if (charge.status !== "paid" && charge.status !== "refunded") return 0;
  if (charge.refundedCents === 0) {
    return charge.status === "paid" ? charge.priceCents : 0;
  }
  const back = refundBreakdown(
    { ...charge, refundedCents: 0 },
    charge.refundedCents,
  );
  return Math.max(0, charge.priceCents - back.priceCents);
}

/**
 * The status a charge should carry once `refundedCents` has been handed back.
 *
 * Partial refunds stay `paid`: the charge still delivered money, and flipping
 * it to `refunded` would make a $5 goodwill refund on a $480 registration read
 * as though the team owed everything again.
 */
export function statusAfterRefund(
  charge: RefundableCharge,
  refundedCents: number,
): "paid" | "refunded" {
  assertCharge({ ...charge, refundedCents: 0 });
  return refundedCents >= charge.totalCents ? "refunded" : "paid";
}
