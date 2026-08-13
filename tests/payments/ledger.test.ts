import { describe, expect, it } from "vitest";

import {
  competitionLedger,
  teamLedgerRow,
  type LedgerCharge,
  type LedgerTeam,
} from "@/lib/payments/ledger";
import { quotePayment } from "@/lib/payments/fees";

let seq = 0;

function charge(
  priceCents: number,
  {
    status = "paid" as LedgerCharge["status"],
    taxCents = 0,
    platformFeeCents = 0,
    refundedCents = 0,
    kind = "team_full" as LedgerCharge["kind"],
    payerEmail = null as string | null,
  } = {},
): LedgerCharge {
  const quote = quotePayment({ priceCents, platformFeeCents, taxCents });
  seq += 1;
  return {
    id: `charge-${seq}`,
    kind,
    payerEmail,
    payerName: null,
    paidAt:
      status === "paid" || status === "refunded"
        ? "2026-08-01T00:00:00Z"
        : null,
    createdAt: "2026-08-01T00:00:00Z",
    status,
    totalCents: quote.totalCents,
    priceCents,
    taxCents,
    applicationFeeCents: quote.applicationFeeCents,
    refundedCents,
  };
}

function team(
  teamName: string,
  charges: LedgerCharge[],
  { status = "active" as LedgerTeam["status"], admittedUnpaid = false } = {},
): LedgerTeam {
  return {
    teamId: `team-${teamName}`,
    teamName,
    status,
    admittedUnpaid,
    charges,
  };
}

const FEE = 12_000; // $120 a team

describe("teamLedgerRow", () => {
  it("reads a team with no charges as unpaid, owing the whole fee", () => {
    const row = teamLedgerRow(team("Nobody", []), { feeCents: FEE });
    expect(row.state).toBe("unpaid");
    expect(row.collectedPriceCents).toBe(0);
    expect(row.outstandingPriceCents).toBe(FEE);
  });

  it("reads a fully paid team as paid, owing nothing", () => {
    const row = teamLedgerRow(team("Paid", [charge(FEE)]), { feeCents: FEE });
    expect(row.state).toBe("paid");
    expect(row.collectedPriceCents).toBe(FEE);
    expect(row.outstandingPriceCents).toBe(0);
  });

  it("reads a half-collected split as partial", () => {
    const shares = [
      charge(3_000, { kind: "player_share", payerEmail: "a@x.co" }),
      charge(3_000, { kind: "player_share", payerEmail: "b@x.co" }),
      charge(3_000, {
        kind: "player_share",
        payerEmail: "c@x.co",
        status: "pending",
      }),
      charge(3_000, {
        kind: "player_share",
        payerEmail: "d@x.co",
        status: "pending",
      }),
    ];
    const row = teamLedgerRow(team("Split", shares), { feeCents: FEE });

    expect(row.state).toBe("partial");
    expect(row.collectedPriceCents).toBe(6_000);
    expect(row.outstandingPriceCents).toBe(6_000);
    expect(row.pendingCharges).toBe(2);
  });

  it("ignores abandoned checkouts entirely", () => {
    const row = teamLedgerRow(
      team("Abandoned", [charge(FEE, { status: "cancelled" })]),
      { feeCents: FEE },
    );
    expect(row.state).toBe("unpaid");
    expect(row.collectedPriceCents).toBe(0);
  });

  it("reopens the balance when a payment is fully refunded", () => {
    const c = charge(FEE, { platformFeeCents: 120 });
    const refunded = {
      ...c,
      status: "refunded" as const,
      refundedCents: c.totalCents,
    };
    const row = teamLedgerRow(team("Refunded", [refunded]), { feeCents: FEE });

    expect(row.state).toBe("unpaid");
    expect(row.collectedPriceCents).toBe(0);
    expect(row.outstandingPriceCents).toBe(FEE);
    expect(row.refundedCents).toBe(c.totalCents);
  });

  it("leaves a partially refunded team owing only the refunded portion", () => {
    const c = charge(FEE, { platformFeeCents: 120 });
    const partial = { ...c, refundedCents: Math.floor(c.totalCents / 2) };
    const row = teamLedgerRow(team("Half back", [partial]), { feeCents: FEE });

    expect(row.state).toBe("partial");
    expect(row.collectedPriceCents).toBeCloseTo(FEE / 2, -2);
    expect(row.outstandingPriceCents).toBeGreaterThan(0);
  });

  it("asks nothing of a withdrawn team but still counts what it paid", () => {
    const row = teamLedgerRow(
      team("Gone", [charge(4_000)], { status: "withdrawn" }),
      { feeCents: FEE },
    );
    expect(row.outstandingPriceCents).toBe(0);
    expect(row.collectedPriceCents).toBe(4_000);
  });

  it("treats every team on a free event as free", () => {
    const row = teamLedgerRow(team("Free", []), { feeCents: 0 });
    expect(row.state).toBe("free");
    expect(row.outstandingPriceCents).toBe(0);
  });

  it("keeps the outstanding balance of a team admitted unpaid", () => {
    const row = teamLedgerRow(
      team("Let in", [charge(2_000)], { admittedUnpaid: true }),
      { feeCents: FEE },
    );
    // Admitting a team does not forgive the debt — that is the whole point.
    expect(row.admittedUnpaid).toBe(true);
    expect(row.outstandingPriceCents).toBe(10_000);
    expect(row.state).toBe("partial");
  });
});

describe("competitionLedger", () => {
  const teams = [
    team("Zebras", [charge(FEE, { platformFeeCents: 120 })]),
    team("Antelopes", []),
    team("Bisons", [charge(6_000, { platformFeeCents: 60 })]),
    team("Cheetahs", [charge(FEE, { platformFeeCents: 120 })], {
      status: "withdrawn",
    }),
  ];

  it("totals the organizer's collected net across teams", () => {
    const ledger = competitionLedger({ teams, feeCents: FEE });
    expect(ledger.totals.collectedPriceCents).toBe(FEE + 6_000 + FEE);
  });

  it("counts only non-withdrawn teams as owing", () => {
    const ledger = competitionLedger({ teams, feeCents: FEE });
    expect(ledger.totals.teamsCounted).toBe(3);
    expect(ledger.totals.teamsPaid).toBe(1);
    expect(ledger.totals.teamsPartial).toBe(1);
    expect(ledger.totals.teamsUnpaid).toBe(1);
    // Antelopes owe the full fee, Bisons owe half. Cheetahs withdrew.
    expect(ledger.totals.outstandingPriceCents).toBe(FEE + 6_000);
  });

  it("puts the teams needing chasing first and withdrawn ones last", () => {
    const ledger = competitionLedger({ teams, feeCents: FEE });
    expect(ledger.teams.map((t) => t.teamName)).toEqual([
      "Antelopes", // unpaid
      "Bisons", // partial
      "Zebras", // paid
      "Cheetahs", // withdrawn
    ]);
  });

  it("nets tax and platform fee down by the refunded proportion", () => {
    const c = charge(10_000, { platformFeeCents: 100, taxCents: 1_300 });
    const full = competitionLedger({
      teams: [team("A", [c])],
      feeCents: 10_000,
    });
    const refunded = competitionLedger({
      teams: [
        team("A", [
          { ...c, status: "refunded" as const, refundedCents: c.totalCents },
        ]),
      ],
      feeCents: 10_000,
    });

    expect(full.totals.collectedTaxCents).toBe(1_300);
    expect(full.totals.platformFeeCents).toBe(c.applicationFeeCents);
    expect(refunded.totals.collectedTaxCents).toBe(0);
    expect(refunded.totals.platformFeeCents).toBe(0);
    expect(refunded.totals.refundedCents).toBe(c.totalCents);
  });

  it("reports gross charged before refunds, so the two are distinguishable", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    const ledger = competitionLedger({
      teams: [team("A", [{ ...c, refundedCents: 500 }])],
      feeCents: 10_000,
    });
    expect(ledger.totals.grossChargedCents).toBe(c.totalCents);
    expect(ledger.totals.refundedCents).toBe(500);
  });

  it("reports a free event with no money as all zeroes", () => {
    const ledger = competitionLedger({
      teams: [team("A", []), team("B", [])],
      feeCents: 0,
    });
    expect(ledger.totals.collectedPriceCents).toBe(0);
    expect(ledger.totals.outstandingPriceCents).toBe(0);
    expect(ledger.teams.every((t) => t.state === "free")).toBe(true);
  });

  it("handles an event with no teams", () => {
    const ledger = competitionLedger({ teams: [], feeCents: FEE });
    expect(ledger.totals.teamsCounted).toBe(0);
    expect(ledger.totals.outstandingPriceCents).toBe(0);
  });
});
