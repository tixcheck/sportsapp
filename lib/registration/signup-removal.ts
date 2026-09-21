/**
 * Whether an individual sign-up can be deleted outright.
 *
 * Brampton's organizer, on a cancelled test registration left greyed out in the
 * pool: "I'd prefer they were removed completely if their registration was
 * cancelled." Withdrawing keeps the row, and a row nobody wants is clutter in
 * the one list an organizer works from.
 *
 * The catch is what a delete takes with it. `registration_payments.free_agent_id`
 * cascades, so deleting a sign-up deletes its payment rows too. For a request
 * nobody paid — pending, or cancelled — that is exactly right: nothing
 * happened, and the request only exists to be chased.
 *
 * For money that MOVED, it depends on whose money it was.
 *
 * A card charge is the platform's business: Stripe holds the truth, a real
 * application fee was taken, and a refund is an object we created. Deleting
 * that row changes the organizer's books and orphans a fee. Never allowed.
 *
 * A PayPal or e-transfer payment is not. We never touched it — the fee on it is
 * zero, nothing was settled, and any refund happened in the organizer's own
 * account where the real record lives. The row here is the ORGANIZER's note to
 * themselves, and the owner's position (2026-09-21) is that the platform is not
 * the book of record for it: "We are not accountable for refunds outside of the
 * platform." So when the organizer says a registration is gone, it can go.
 *
 * A row whose `method` is null predates the column. Provenance unknown, so it
 * refuses — guessing wrong here destroys a record that cannot be recovered.
 *
 * Pure: no DB.
 */

export interface SignupPayment {
  /** `registration_payment_status`: pending / paid / cancelled / refunded. */
  status: string;
  /** `card`, or an offline method (paypal / etransfer). Null on older rows. */
  method: string | null;
  /** The platform's cut. Zero on anything taken off-platform. */
  applicationFeeCents: number;
  /** Set once the platform's fee on an offline payment has been settled up. */
  platformFeeSettledAt: string | null;
}

export type RemovalCheck =
  | { canDelete: true }
  | { canDelete: false; reason: string };

/** Statuses that mean money reached the organizer at some point. */
const MONEY_MOVED = new Set(["paid", "refunded"]);

/**
 * Money the platform never handled and is owed nothing on.
 *
 * All three conditions, not just the method: a settled fee or a non-zero
 * application fee means this row is part of our accounting whatever route the
 * money took, and deleting it would leave that dangling.
 */
function offPlatform(p: SignupPayment): boolean {
  return (
    p.method !== null &&
    p.method !== "card" &&
    p.applicationFeeCents === 0 &&
    p.platformFeeSettledAt === null
  );
}

export function canDeleteSignup(payments: SignupPayment[]): RemovalCheck {
  const moved = payments.filter((p) => MONEY_MOVED.has(p.status));
  if (moved.length === 0) return { canDelete: true };
  if (moved.every(offPlatform)) return { canDelete: true };

  const platformHeld = moved.filter((p) => !offPlatform(p));
  return {
    canDelete: false,
    reason:
      platformHeld.some((p) => p.status === "refunded") &&
      !platformHeld.some((p) => p.status === "paid")
        ? "That sign-up has a refund the platform processed. Removing it would delete the refund record — use Withdraw instead, which keeps it."
        : "That payment was taken through the platform. Removing the sign-up would delete the record and the fee owed on it — use Withdraw instead, which keeps them.",
  };
}
