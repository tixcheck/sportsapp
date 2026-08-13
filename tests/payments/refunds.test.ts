import { describe, expect, it } from "vitest";

import {
  netPriceCents,
  refundBreakdown,
  refundableCents,
  statusAfterRefund,
  type RefundableCharge,
} from "@/lib/payments/refunds";
import { quotePayment } from "@/lib/payments/fees";

/** A charge built the way the real flow builds one, so the balance holds. */
function charge(
  priceCents: number,
  {
    taxCents = 0,
    platformFeeCents = 0,
    status = "paid" as RefundableCharge["status"],
    refundedCents = 0,
  } = {},
): RefundableCharge {
  const quote = quotePayment({ priceCents, platformFeeCents, taxCents });
  return {
    status,
    totalCents: quote.totalCents,
    priceCents,
    taxCents,
    applicationFeeCents: quote.applicationFeeCents,
    refundedCents,
  };
}

describe("refundableCents", () => {
  it("offers the full total on an untouched paid charge", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    expect(refundableCents(c)).toBe(c.totalCents);
  });

  it("offers nothing on a charge that never collected money", () => {
    expect(refundableCents(charge(10_000, { status: "pending" }))).toBe(0);
    expect(refundableCents(charge(10_000, { status: "cancelled" }))).toBe(0);
  });

  it("offers only the remainder after a partial refund", () => {
    const c = charge(10_000, { platformFeeCents: 100, refundedCents: 2_000 });
    expect(refundableCents(c)).toBe(c.totalCents - 2_000);
  });

  it("offers nothing once fully refunded", () => {
    const base = charge(10_000, { platformFeeCents: 100 });
    const c = {
      ...base,
      status: "refunded" as const,
      refundedCents: base.totalCents,
    };
    expect(refundableCents(c)).toBe(0);
  });
});

describe("refundBreakdown", () => {
  it("gives every party back exactly its own cut on a full refund", () => {
    const c = charge(10_000, { platformFeeCents: 100, taxCents: 1_300 });
    const back = refundBreakdown(c, c.totalCents);

    expect(back.priceCents).toBe(c.priceCents);
    expect(back.taxCents).toBe(c.taxCents);
    expect(back.applicationFeeCents).toBe(c.applicationFeeCents);
  });

  it("always splits into parts that sum to the refund", () => {
    // Awkward amounts on purpose: these are where naive rounding loses a cent.
    for (const price of [1, 7, 99, 333, 1_667, 4_999, 10_001]) {
      for (const tax of [0, 13, 217]) {
        const c = charge(price, { platformFeeCents: 33, taxCents: tax });
        for (const refund of [
          1,
          2,
          7,
          Math.ceil(c.totalCents / 3),
          c.totalCents,
        ]) {
          if (refund > c.totalCents) continue;
          const back = refundBreakdown(c, refund);
          expect(
            back.priceCents + back.taxCents + back.applicationFeeCents,
          ).toBe(refund);
          expect(back.priceCents).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("splits a half refund roughly in half", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    const half = Math.floor(c.totalCents / 2);
    const back = refundBreakdown(c, half);

    expect(back.applicationFeeCents).toBeCloseTo(c.applicationFeeCents / 2, -1);
    expect(back.priceCents).toBeCloseTo(c.priceCents / 2, -1);
  });

  it("refuses more than the charge can give back", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    expect(() => refundBreakdown(c, c.totalCents + 1)).toThrow(/only/);
  });

  it("refuses to refund a charge that never collected", () => {
    const c = charge(10_000, { status: "pending" });
    expect(() => refundBreakdown(c, 100)).toThrow(/only 0 remain/);
  });

  it("refuses a zero or negative refund", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    expect(() => refundBreakdown(c, 0)).toThrow(/positive integer/);
    expect(() => refundBreakdown(c, -500)).toThrow(/positive integer/);
  });

  it("rejects a charge whose parts do not add up", () => {
    const broken: RefundableCharge = {
      status: "paid",
      totalCents: 1_000,
      priceCents: 900,
      taxCents: 0,
      applicationFeeCents: 50, // 50 cents unaccounted for
      refundedCents: 0,
    };
    expect(() => refundBreakdown(broken, 100)).toThrow(/does not balance/);
  });

  it("never hands the platform more than it took, across many splits", () => {
    const c = charge(4_999, { platformFeeCents: 50, taxCents: 217 });
    let feeBack = 0;
    let refunded = 0;
    // Refund it 7 cents at a time to the end.
    while (refunded < c.totalCents) {
      const step = Math.min(7, c.totalCents - refunded);
      const back = refundBreakdown({ ...c, refundedCents: refunded }, step);
      feeBack += back.applicationFeeCents;
      refunded += step;
    }
    expect(refunded).toBe(c.totalCents);
    expect(feeBack).toBeLessThanOrEqual(c.applicationFeeCents);
  });
});

describe("netPriceCents", () => {
  it("is the full price for an unrefunded paid charge", () => {
    expect(netPriceCents(charge(8_000, { platformFeeCents: 80 }))).toBe(8_000);
  });

  it("is zero for a charge that never collected", () => {
    expect(netPriceCents(charge(8_000, { status: "pending" }))).toBe(0);
    expect(netPriceCents(charge(8_000, { status: "cancelled" }))).toBe(0);
  });

  it("is zero once fully refunded", () => {
    const base = charge(8_000, { platformFeeCents: 80, taxCents: 1_040 });
    const c = {
      ...base,
      status: "refunded" as const,
      refundedCents: base.totalCents,
    };
    expect(netPriceCents(c)).toBe(0);
  });

  it("drops by the price portion of a partial refund", () => {
    const base = charge(8_000, { platformFeeCents: 80 });
    const half = Math.floor(base.totalCents / 2);
    const net = netPriceCents({ ...base, refundedCents: half });

    expect(net).toBeLessThan(8_000);
    expect(net).toBeCloseTo(4_000, -2);
  });

  it("never goes negative", () => {
    const base = charge(1, { platformFeeCents: 0 });
    const net = netPriceCents({ ...base, refundedCents: base.totalCents });
    expect(net).toBeGreaterThanOrEqual(0);
  });
});

describe("statusAfterRefund", () => {
  it("keeps a partially refunded charge paid", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    expect(statusAfterRefund(c, 500)).toBe("paid");
  });

  it("marks a fully refunded charge refunded", () => {
    const c = charge(10_000, { platformFeeCents: 100 });
    expect(statusAfterRefund(c, c.totalCents)).toBe("refunded");
  });
});
