import { describe, expect, it } from "vitest";

import {
  canDeleteSignup,
  type SignupPayment,
} from "@/lib/registration/signup-removal";

/** A PayPal payment the way BVL's are: no fee taken, nothing settled. */
function offline(
  status: string,
  over: Partial<SignupPayment> = {},
): SignupPayment {
  return {
    status,
    method: "paypal",
    applicationFeeCents: 0,
    platformFeeSettledAt: null,
    ...over,
  };
}

/** A card charge — Stripe holds the truth and we took a cut. */
function card(
  status: string,
  over: Partial<SignupPayment> = {},
): SignupPayment {
  return {
    status,
    method: "card",
    applicationFeeCents: 250,
    platformFeeSettledAt: null,
    ...over,
  };
}

describe("canDeleteSignup", () => {
  it("allows removing a sign-up nobody paid for", () => {
    expect(canDeleteSignup([])).toEqual({ canDelete: true });
  });

  // Roslyn Ng: a test entry whose $340 PayPal request was cancelled. Nothing
  // happened, and the request only ever existed to be chased.
  it("allows removing one whose request was cancelled or is still pending", () => {
    expect(canDeleteSignup([card("cancelled")])).toEqual({ canDelete: true });
    expect(canDeleteSignup([card("pending")])).toEqual({ canDelete: true });
  });

  describe("money the platform handled", () => {
    it("refuses once a card payment has arrived", () => {
      const check = canDeleteSignup([card("paid")]);
      expect(check.canDelete).toBe(false);
      expect(check).toMatchObject({
        reason: expect.stringContaining("platform"),
      });
    });

    it("refuses on a card refund, and says so", () => {
      const check = canDeleteSignup([card("refunded")]);
      expect(check.canDelete).toBe(false);
      expect(check).toMatchObject({
        reason: expect.stringContaining("refund"),
      });
    });

    it("names the payment, not the refund, when both exist", () => {
      const check = canDeleteSignup([card("paid"), card("refunded")]);
      expect(check).toMatchObject({
        reason: expect.stringContaining("payment"),
      });
    });

    /**
     * The wording is the fix, not a detail. It used to read "refund it first,
     * or leave them withdrawn" — and for an individual the organizer UI offered
     * neither, which sent BVL's organizer hunting for a payment screen that did
     * not exist. Refusing is right; misdirecting is not.
     */
    it("points at Withdraw, the one way out that exists", () => {
      for (const payments of [[card("paid")], [card("refunded")]]) {
        expect(canDeleteSignup(payments)).toMatchObject({
          reason: expect.stringContaining("Withdraw"),
        });
      }
    });
  });

  /**
   * Money that moved OUTSIDE the platform. The owner's call, 2026-09-21: "We
   * are not accountable for refunds outside of the platform." We never touched
   * it, the fee on it is zero, and the real record lives in the organizer's own
   * PayPal — so the row here is their note to themselves, and theirs to discard.
   */
  describe("money that moved off-platform", () => {
    it("allows removing a sign-up paid by PayPal", () => {
      expect(canDeleteSignup([offline("paid")])).toEqual({ canDelete: true });
    });

    it("allows removing one refunded off-platform", () => {
      expect(canDeleteSignup([offline("refunded")])).toEqual({
        canDelete: true,
      });
    });

    it("allows the double-payer, whose rows are both off-platform", () => {
      expect(canDeleteSignup([offline("paid"), offline("paid")])).toEqual({
        canDelete: true,
      });
    });

    // Every condition matters, not just the method. A fee we charged or settled
    // makes the row part of our accounting whatever route the money took.
    it("still refuses when a fee was charged on it", () => {
      const check = canDeleteSignup([
        offline("paid", { applicationFeeCents: 100 }),
      ]);
      expect(check.canDelete).toBe(false);
    });

    it("still refuses once the platform fee has been settled", () => {
      const check = canDeleteSignup([
        offline("paid", { platformFeeSettledAt: "2026-09-01T00:00:00Z" }),
      ]);
      expect(check.canDelete).toBe(false);
    });

    // Provenance unknown: this row predates the method column. Guessing wrong
    // destroys a record that cannot be recovered, so it refuses.
    it("refuses a row whose method is unknown", () => {
      const check = canDeleteSignup([offline("paid", { method: null })]);
      expect(check.canDelete).toBe(false);
    });

    it("refuses when one card charge sits among off-platform ones", () => {
      const check = canDeleteSignup([offline("paid"), card("paid")]);
      expect(check.canDelete).toBe(false);
    });
  });
});
