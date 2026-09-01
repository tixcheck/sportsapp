/**
 * The organizer's view of the money for one competition.
 *
 * Rolls raw `registration_payments` rows up into what a person actually needs
 * to answer: who has paid, who is short, what has landed, and what is still
 * out. Pure — the query layer fetches, this decides what the numbers mean, and
 * the component only renders. That split is what makes these sums testable
 * without a database.
 *
 * Nothing here is stored. A payments dashboard is a derived view for the same
 * reason standings are: the moment you cache a total, a refund makes it a lie.
 */

import { netPriceCents, type RefundableCharge } from "@/lib/payments/refunds";

export type LedgerCharge = RefundableCharge & {
  id: string;
  kind: "team_full" | "player_share";
  /** Null for a `team_full` charge — it belongs to the team, not a person. */
  payerEmail: string | null;
  payerName: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type LedgerTeam = {
  teamId: string;
  teamName: string;
  status: "active" | "withdrawn" | "pending_payment" | "pending_waiver";
  /** True when an organizer let this team play with a balance outstanding. */
  admittedUnpaid: boolean;
  charges: LedgerCharge[];
};

/** Where one team stands. `state` matches `teamPaymentState` for consistency. */
export type TeamLedgerRow = LedgerTeam & {
  state: "free" | "unpaid" | "partial" | "paid";
  /** Organizer's net actually collected from this team, after refunds. */
  collectedPriceCents: number;
  /** Organizer's net still owed. Zero for a withdrawn or free team. */
  outstandingPriceCents: number;
  /** Payer-facing total handed back. */
  refundedCents: number;
  /** Charges still open (someone started checkout and hasn't finished). */
  pendingCharges: number;
};

export type LedgerTotals = {
  /** Teams the fee is measured against — withdrawn teams are not chased. */
  teamsCounted: number;
  teamsPaid: number;
  teamsPartial: number;
  teamsUnpaid: number;
  /** Organizer's net collected across the event, after refunds. */
  collectedPriceCents: number;
  /** Tax collected on the organizer's behalf, after refunds. */
  collectedTaxCents: number;
  /** The platform's cut on settled charges, after refunds. */
  platformFeeCents: number;
  /** What payers were charged in total, before refunds. */
  grossChargedCents: number;
  /** Handed back to payers. */
  refundedCents: number;
  /** Organizer's net still owed across every counted team. */
  outstandingPriceCents: number;
};

export type CompetitionLedger = {
  feeCents: number;
  teams: TeamLedgerRow[];
  totals: LedgerTotals;
};

/** A charge that settled — the only kind that moved money. */
function isSettled(c: LedgerCharge): boolean {
  return c.status === "paid" || c.status === "refunded";
}

/**
 * Pro-rata portion of one component of a charge that has been refunded.
 *
 * Mirrors `refundBreakdown`, but for a single component at a time so the
 * totals can be accumulated independently.
 */
function refundedPortion(charge: LedgerCharge, componentCents: number): number {
  if (charge.refundedCents <= 0 || charge.totalCents <= 0) return 0;
  return Math.round(
    (componentCents * charge.refundedCents) / charge.totalCents,
  );
}

/**
 * Roll one team's charges into a payment position.
 *
 * `outstanding` is measured against the event fee rather than by counting
 * unpaid rows: a split team's rows only exist once someone starts checkout, so
 * counting rows would report a team that has done nothing as fully paid.
 *
 * A **withdrawn** team owes nothing. They're out; chasing them for a fee they
 * were never going to use is not a debt the dashboard should display. Money
 * they already paid still shows as collected — because it was.
 */
export function teamLedgerRow(
  team: LedgerTeam,
  { feeCents }: { feeCents: number },
): TeamLedgerRow {
  const settled = team.charges.filter(isSettled);
  const collectedPriceCents = settled.reduce(
    (sum, c) => sum + netPriceCents(c),
    0,
  );
  const refundedCents = settled.reduce((sum, c) => sum + c.refundedCents, 0);
  const pendingCharges = team.charges.filter(
    (c) => c.status === "pending",
  ).length;

  if (feeCents <= 0) {
    return {
      ...team,
      state: "free",
      collectedPriceCents,
      outstandingPriceCents: 0,
      refundedCents,
      pendingCharges,
    };
  }

  const owed = team.status === "withdrawn" ? 0 : feeCents;
  const outstandingPriceCents = Math.max(0, owed - collectedPriceCents);

  const state =
    outstandingPriceCents === 0
      ? "paid"
      : collectedPriceCents > 0
        ? "partial"
        : "unpaid";

  return {
    ...team,
    state,
    collectedPriceCents,
    outstandingPriceCents,
    refundedCents,
    pendingCharges,
  };
}

/**
 * The whole competition's payment position.
 *
 * Team rows come back sorted by how much attention they need — the teams still
 * owing money first, then by name. An organizer opens this page to find out who
 * to chase, so the answer should be at the top rather than in alphabetical
 * order somewhere in the middle.
 */
export function competitionLedger({
  teams,
  feeCents,
}: {
  teams: LedgerTeam[];
  feeCents: number;
}): CompetitionLedger {
  const rows = teams.map((t) => teamLedgerRow(t, { feeCents }));

  const settled = rows.flatMap((r) => r.charges.filter(isSettled));

  const totals: LedgerTotals = {
    teamsCounted: rows.filter((r) => r.status !== "withdrawn").length,
    teamsPaid: rows.filter(
      (r) => r.status !== "withdrawn" && r.state === "paid",
    ).length,
    teamsPartial: rows.filter(
      (r) => r.status !== "withdrawn" && r.state === "partial",
    ).length,
    teamsUnpaid: rows.filter(
      (r) => r.status !== "withdrawn" && r.state === "unpaid",
    ).length,
    collectedPriceCents: rows.reduce((s, r) => s + r.collectedPriceCents, 0),
    collectedTaxCents: settled.reduce(
      (s, c) => s + c.taxCents - refundedPortion(c, c.taxCents),
      0,
    ),
    platformFeeCents: settled.reduce(
      (s, c) =>
        s + c.applicationFeeCents - refundedPortion(c, c.applicationFeeCents),
      0,
    ),
    grossChargedCents: settled.reduce((s, c) => s + c.totalCents, 0),
    refundedCents: settled.reduce((s, c) => s + c.refundedCents, 0),
    outstandingPriceCents: rows.reduce(
      (s, r) => s + r.outstandingPriceCents,
      0,
    ),
  };

  const attention: Record<TeamLedgerRow["state"], number> = {
    unpaid: 0,
    partial: 1,
    paid: 2,
    free: 3,
  };
  const sorted = [...rows].sort((a, b) => {
    // Withdrawn teams are settled business — never at the top.
    const aOut = a.status === "withdrawn" ? 1 : 0;
    const bOut = b.status === "withdrawn" ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    if (attention[a.state] !== attention[b.state]) {
      return attention[a.state] - attention[b.state];
    }
    return a.teamName.localeCompare(b.teamName);
  });

  return { feeCents, teams: sorted, totals };
}
