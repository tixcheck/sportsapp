/**
 * The organizer's view of the money for people who signed up WITHOUT a team.
 *
 * `competitionLedger` groups charges by `team_id`, and an individual's charge
 * has none — it hangs off `free_agent_id`. So individuals were never filtered
 * out of the payments dashboard; they were never represented in it. An
 * organizer could see every team's fee and not one free agent's, which is
 * exactly what BVL reported.
 *
 * The rules are deliberately the team rules, so the two panels can be read the
 * same way: settled means paid or refunded, outstanding is measured against the
 * event's individual fee rather than by counting rows, and someone withdrawn
 * owes nothing while money they already paid still counts as collected.
 *
 * Tax and platform fee are NOT totalled here. Individual fees are overwhelmingly
 * taken off-platform (PayPal, e-transfer), where both are zero by construction,
 * and a permanent $0 beside real money reads as a bug rather than a fact.
 *
 * Pure — no DB. The query layer fetches, this decides what the numbers mean.
 */

import { netPriceCents, type RefundableCharge } from "@/lib/payments/refunds";

export type IndividualCharge = RefundableCharge & {
  id: string;
  /**
   * `card`, or an offline method (paypal / etransfer). Null on older rows.
   * Offline means a human confirmed it — and, per the platform's position, a
   * refund of one happens outside the app entirely.
   */
  method: string | null;
  paidAt: string | null;
  createdAt: string;
  /** What the payer said they sent, to match against the organizer's account. */
  payerReference: string | null;
};

export type IndividualSignupStatus =
  | "pending_payment"
  | "available"
  | "placed"
  | "withdrawn";

export type IndividualSignup = {
  freeAgentId: string;
  name: string;
  email: string | null;
  status: IndividualSignupStatus;
  charges: IndividualCharge[];
};

export type IndividualLedgerRow = IndividualSignup & {
  state: "free" | "unpaid" | "partial" | "paid";
  /** Organizer's net actually collected from this person, after refunds. */
  collectedPriceCents: number;
  /** Still owed. Zero for someone withdrawn, and for a free event. */
  outstandingPriceCents: number;
  refundedCents: number;
  /** Charges still open — they started a payment and it was never confirmed. */
  pendingCharges: number;
};

export type IndividualTotals = {
  /** People the fee is measured against — the withdrawn are not chased. */
  counted: number;
  paid: number;
  partial: number;
  unpaid: number;
  collectedPriceCents: number;
  /** What payers were charged in total, before refunds. */
  grossChargedCents: number;
  refundedCents: number;
  outstandingPriceCents: number;
};

export type IndividualLedger = {
  feeCents: number;
  signups: IndividualLedgerRow[];
  totals: IndividualTotals;
};

/** A charge that settled — the only kind that moved money. */
function isSettled(c: IndividualCharge): boolean {
  return c.status === "paid" || c.status === "refunded";
}

/** Roll one person's charges into a payment position. */
export function individualLedgerRow(
  signup: IndividualSignup,
  { feeCents }: { feeCents: number },
): IndividualLedgerRow {
  const settled = signup.charges.filter(isSettled);
  const collectedPriceCents = settled.reduce(
    (sum, c) => sum + netPriceCents(c),
    0,
  );
  const refundedCents = settled.reduce((sum, c) => sum + c.refundedCents, 0);
  const pendingCharges = signup.charges.filter(
    (c) => c.status === "pending",
  ).length;

  if (feeCents <= 0) {
    return {
      ...signup,
      state: "free",
      collectedPriceCents,
      outstandingPriceCents: 0,
      refundedCents,
      pendingCharges,
    };
  }

  const owed = signup.status === "withdrawn" ? 0 : feeCents;
  const outstandingPriceCents = Math.max(0, owed - collectedPriceCents);

  const state =
    outstandingPriceCents === 0
      ? "paid"
      : collectedPriceCents > 0
        ? "partial"
        : "unpaid";

  return {
    ...signup,
    state,
    collectedPriceCents,
    outstandingPriceCents,
    refundedCents,
    pendingCharges,
  };
}

/**
 * Every individual's payment position for one competition.
 *
 * Sorted by how much attention each needs — whoever still owes money first,
 * then by name — for the same reason the team table is: an organizer opens this
 * to find who to chase, and the answer should not be somewhere in the middle of
 * an alphabetical list. Withdrawn sign-ups are settled business and sink to the
 * bottom whatever they owe.
 */
export function individualLedger({
  signups,
  feeCents,
}: {
  signups: IndividualSignup[];
  feeCents: number;
}): IndividualLedger {
  const rows = signups.map((s) => individualLedgerRow(s, { feeCents }));
  const settled = rows.flatMap((r) => r.charges.filter(isSettled));
  const counted = rows.filter((r) => r.status !== "withdrawn");

  const totals: IndividualTotals = {
    counted: counted.length,
    paid: counted.filter((r) => r.state === "paid").length,
    partial: counted.filter((r) => r.state === "partial").length,
    unpaid: counted.filter((r) => r.state === "unpaid").length,
    collectedPriceCents: rows.reduce((s, r) => s + r.collectedPriceCents, 0),
    grossChargedCents: settled.reduce((s, c) => s + c.totalCents, 0),
    refundedCents: settled.reduce((s, c) => s + c.refundedCents, 0),
    outstandingPriceCents: rows.reduce(
      (s, r) => s + r.outstandingPriceCents,
      0,
    ),
  };

  const attention: Record<IndividualLedgerRow["state"], number> = {
    unpaid: 0,
    partial: 1,
    paid: 2,
    free: 3,
  };
  const sorted = [...rows].sort((a, b) => {
    const aOut = a.status === "withdrawn" ? 1 : 0;
    const bOut = b.status === "withdrawn" ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    if (attention[a.state] !== attention[b.state]) {
      return attention[a.state] - attention[b.state];
    }
    return a.name.localeCompare(b.name);
  });

  return { feeCents, signups: sorted, totals };
}
