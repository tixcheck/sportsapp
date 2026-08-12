import { describe, expect, it } from "vitest";

import {
  DEFAULT_STRIPE_RATE,
  quotePayment,
  splitEvenly,
} from "@/lib/payments/fees";

describe("quotePayment", () => {
  it("leaves the organizer with exactly their price (plan's worked example)", () => {
    // R = $100 tournament, P = 1% = $1.00.
    const q = quotePayment({ priceCents: 10_000, platformFeeCents: 100 });

    expect(q.organizerNetCents).toBe(10_000);
    // Plan quotes ~$104.32; we ceil, so $104.33. The extra cent is the
    // platform's, never the organizer's.
    expect(q.totalCents).toBe(10_433);
    expect(q.applicationFeeCents).toBe(433);
    expect(q.estimatedStripeFeeCents).toBe(333);
    expect(q.platformNetCents).toBe(100);
  });

  it("keeps the organizer exact across a wide sweep of prices", () => {
    for (let price = 0; price <= 50_000; price += 137) {
      for (const fee of [0, 100, 300, 2_000]) {
        const q = quotePayment({ priceCents: price, platformFeeCents: fee });
        // The invariant that matters: the organizer nets their price, always.
        expect(q.organizerNetCents).toBe(price);
        // And the payer's money is fully accounted for.
        expect(q.totalCents).toBe(q.organizerNetCents + q.applicationFeeCents);
      }
    }
  });

  it("never underfunds the platform — rounding always lands on our side", () => {
    for (let price = 100; price <= 20_000; price += 71) {
      const q = quotePayment({ priceCents: price, platformFeeCents: 100 });
      // After Stripe takes its estimated cut, we still clear the intended fee.
      expect(q.platformNetCents).toBeGreaterThanOrEqual(100);
      // ...and never by more than a rounding cent or two.
      expect(q.platformNetCents).toBeLessThanOrEqual(102);
    }
  });

  it("routes tax to the organizer on top of the price", () => {
    const q = quotePayment({
      priceCents: 10_000,
      platformFeeCents: 100,
      taxCents: 1_300,
    });

    expect(q.taxCents).toBe(1_300);
    expect(q.organizerNetCents).toBe(11_300);
    expect(q.totalCents).toBeGreaterThan(11_300);
    expect(q.applicationFeeCents).toBe(q.totalCents - 11_300);
  });

  it("treats a free registration as free, not as a 31-cent charge", () => {
    const q = quotePayment({ priceCents: 0, platformFeeCents: 0 });
    expect(q).toEqual({
      totalCents: 0,
      applicationFeeCents: 0,
      organizerNetCents: 0,
      taxCents: 0,
      estimatedStripeFeeCents: 0,
      platformNetCents: 0,
    });
  });

  it("still charges when the price is zero but a platform fee applies", () => {
    const q = quotePayment({ priceCents: 0, platformFeeCents: 300 });
    expect(q.totalCents).toBeGreaterThan(300);
    expect(q.organizerNetCents).toBe(0);
  });

  it("honours a league per-player fee ($3) and per-team fee ($20)", () => {
    const perPlayer = quotePayment({
      priceCents: 4_000,
      platformFeeCents: 300,
    });
    expect(perPlayer.organizerNetCents).toBe(4_000);
    expect(perPlayer.platformNetCents).toBeGreaterThanOrEqual(300);

    const perTeam = quotePayment({
      priceCents: 48_000,
      platformFeeCents: 2_000,
    });
    expect(perTeam.organizerNetCents).toBe(48_000);
    expect(perTeam.platformNetCents).toBeGreaterThanOrEqual(2_000);
  });

  it("accepts an overridden Stripe rate", () => {
    const q = quotePayment({
      priceCents: 10_000,
      platformFeeCents: 0,
      stripe: { percent: 0, fixedCents: 0 },
    });
    // No processing cost => the payer pays exactly the price.
    expect(q.totalCents).toBe(10_000);
    expect(q.applicationFeeCents).toBe(0);
  });

  it("rejects nonsense inputs rather than quietly producing a wrong price", () => {
    expect(() =>
      quotePayment({ priceCents: -1, platformFeeCents: 0 }),
    ).toThrow();
    expect(() =>
      quotePayment({ priceCents: 10.5, platformFeeCents: 0 }),
    ).toThrow();
    expect(() =>
      quotePayment({
        priceCents: 100,
        platformFeeCents: 0,
        stripe: { percent: 1, fixedCents: 30 },
      }),
    ).toThrow();
  });

  it("uses Canada's published online card rate by default", () => {
    expect(DEFAULT_STRIPE_RATE).toEqual({ percent: 0.029, fixedCents: 30 });
  });
});

describe("splitEvenly", () => {
  it("splits a divisible amount evenly", () => {
    expect(splitEvenly(48_000, 6)).toEqual([
      8_000, 8_000, 8_000, 8_000, 8_000, 8_000,
    ]);
  });

  it("gives remainder cents to the earliest payers", () => {
    expect(splitEvenly(1_000, 3)).toEqual([334, 333, 333]);
  });

  it("always sums back to the original total", () => {
    for (let total = 0; total < 5_000; total += 7) {
      for (const ways of [1, 2, 3, 4, 6, 12]) {
        const parts = splitEvenly(total, ways);
        expect(parts).toHaveLength(ways);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("handles a total smaller than the number of payers", () => {
    expect(splitEvenly(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });

  it("rejects a non-positive split", () => {
    expect(() => splitEvenly(100, 0)).toThrow();
    expect(() => splitEvenly(100, -1)).toThrow();
  });
});
