import { describe, expect, it } from "vitest";

import {
  individualLedger,
  individualLedgerRow,
  type IndividualCharge,
  type IndividualSignup,
  type IndividualSignupStatus,
} from "@/lib/payments/individual-ledger";

const FEE = 34000; // BVL's Wednesday individual fee, $340.

/**
 * An offline charge the way BVL's actually look: the whole amount is the
 * organizer's price, with no tax and no platform fee, because we never handled
 * the money. `assertCharge` requires price + tax + fee === total, so these must
 * balance exactly.
 */
function charge(
  over: Partial<IndividualCharge> & { status: IndividualCharge["status"] },
): IndividualCharge {
  const price = over.priceCents ?? FEE;
  return {
    id: "pay1",
    method: "paypal",
    paidAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    payerReference: null,
    priceCents: price,
    taxCents: 0,
    applicationFeeCents: 0,
    totalCents: price,
    refundedCents: 0,
    ...over,
  };
}

function signup(
  name: string,
  status: IndividualSignupStatus,
  charges: IndividualCharge[] = [],
): IndividualSignup {
  return { freeAgentId: name, name, email: null, status, charges };
}

describe("individualLedgerRow", () => {
  it("counts someone who has paid as paid, with nothing outstanding", () => {
    const row = individualLedgerRow(
      signup("Ada", "available", [charge({ status: "paid" })]),
      { feeCents: FEE },
    );
    expect(row.state).toBe("paid");
    expect(row.collectedPriceCents).toBe(FEE);
    expect(row.outstandingPriceCents).toBe(0);
  });

  it("owes the whole fee when nothing has been paid", () => {
    const row = individualLedgerRow(signup("Bea", "pending_payment"), {
      feeCents: FEE,
    });
    expect(row.state).toBe("unpaid");
    expect(row.outstandingPriceCents).toBe(FEE);
  });

  // A started-but-unconfirmed PayPal payment is not money. It shows as a count
  // so the organizer knows to look in the offline inbox, not as collected.
  it("does not treat a pending charge as collected", () => {
    const row = individualLedgerRow(
      signup("Cyd", "pending_payment", [charge({ status: "pending" })]),
      { feeCents: FEE },
    );
    expect(row.collectedPriceCents).toBe(0);
    expect(row.outstandingPriceCents).toBe(FEE);
    expect(row.pendingCharges).toBe(1);
  });

  it("goes partial when some of the fee came back", () => {
    const row = individualLedgerRow(
      signup("Dot", "available", [
        charge({ status: "paid", refundedCents: 10000 }),
      ]),
      { feeCents: FEE },
    );
    expect(row.collectedPriceCents).toBe(FEE - 10000);
    expect(row.outstandingPriceCents).toBe(10000);
    expect(row.state).toBe("partial");
    expect(row.refundedCents).toBe(10000);
  });

  /**
   * The rule the team ledger already follows: someone who pulled out is not
   * chased for a fee they will never use — but money they did pay was still
   * collected, and hiding it would understate what the organizer holds.
   */
  it("stops chasing a withdrawn sign-up, but keeps what they paid", () => {
    const row = individualLedgerRow(signup("Eve", "withdrawn"), {
      feeCents: FEE,
    });
    expect(row.outstandingPriceCents).toBe(0);

    const paid = individualLedgerRow(
      signup("Eve", "withdrawn", [charge({ status: "paid" })]),
      { feeCents: FEE },
    );
    expect(paid.collectedPriceCents).toBe(FEE);
    expect(paid.outstandingPriceCents).toBe(0);
  });

  it("treats a free event as free rather than fully unpaid", () => {
    const row = individualLedgerRow(signup("Fay", "available"), {
      feeCents: 0,
    });
    expect(row.state).toBe("free");
    expect(row.outstandingPriceCents).toBe(0);
  });
});

describe("individualLedger", () => {
  it("puts whoever owes money first, and the withdrawn last", () => {
    const table = individualLedger({
      feeCents: FEE,
      signups: [
        signup("Zoe", "available", [charge({ status: "paid" })]),
        signup("Amy", "withdrawn"),
        signup("Ben", "pending_payment"),
        signup("Cal", "available", [
          charge({ status: "paid", refundedCents: 10000 }),
        ]),
      ],
    });
    expect(table.signups.map((s) => s.name)).toEqual([
      "Ben", // unpaid
      "Cal", // partial
      "Zoe", // paid
      "Amy", // withdrawn, whatever they owe
    ]);
  });

  it("totals only the people still being counted", () => {
    const table = individualLedger({
      feeCents: FEE,
      signups: [
        signup("Ada", "available", [charge({ status: "paid" })]),
        signup("Ben", "pending_payment"),
        signup("Amy", "withdrawn"),
      ],
    });
    expect(table.totals.counted).toBe(2);
    expect(table.totals.paid).toBe(1);
    expect(table.totals.unpaid).toBe(1);
    expect(table.totals.collectedPriceCents).toBe(FEE);
    expect(table.totals.outstandingPriceCents).toBe(FEE);
    expect(table.totals.grossChargedCents).toBe(FEE);
  });

  it("handles a competition nobody has signed up for", () => {
    const table = individualLedger({ feeCents: FEE, signups: [] });
    expect(table.signups).toEqual([]);
    expect(table.totals.counted).toBe(0);
    expect(table.totals.outstandingPriceCents).toBe(0);
  });

  // The real BVL Wednesday shape: six paid, one still pending.
  it("matches a real competition's position", () => {
    const table = individualLedger({
      feeCents: FEE,
      signups: [
        ...Array.from({ length: 6 }, (_, i) =>
          signup(`paid${i}`, "available", [charge({ status: "paid" })]),
        ),
        signup("waiting", "pending_payment", [charge({ status: "pending" })]),
      ],
    });
    expect(table.totals.counted).toBe(7);
    expect(table.totals.paid).toBe(6);
    expect(table.totals.unpaid).toBe(1);
    expect(table.totals.collectedPriceCents).toBe(6 * FEE);
    expect(table.totals.outstandingPriceCents).toBe(FEE);
  });
});
