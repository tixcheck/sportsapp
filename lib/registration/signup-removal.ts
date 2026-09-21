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
 * happened, and the request only exists to be chased. For money that actually
 * moved it is the wrong trade at any price: the ledger, the platform fee owed
 * on it and any refund all hang off that row, and an organizer's books should
 * not change because they tidied a list.
 *
 * So: delete freely until money has moved, and never after.
 *
 * Pure: no DB.
 */

export interface SignupPayment {
  /** `registration_payment_status`: pending / paid / cancelled / refunded. */
  status: string;
}

export type RemovalCheck =
  | { canDelete: true }
  | { canDelete: false; reason: string };

/** Statuses that mean money reached the organizer at some point. */
const MONEY_MOVED = new Set(["paid", "refunded"]);

export function canDeleteSignup(payments: SignupPayment[]): RemovalCheck {
  const paid = payments.filter((p) => MONEY_MOVED.has(p.status));
  if (paid.length === 0) return { canDelete: true };
  return {
    canDelete: false,
    reason:
      paid.some((p) => p.status === "refunded") &&
      !paid.some((p) => p.status === "paid")
        ? "That sign-up has a refund on record. Removing it would delete the refund too — use Withdraw instead, which keeps the record."
        : "That sign-up has been paid. Removing it would delete the payment record — use Withdraw instead, which keeps the record and frees their spot.",
  };
}
