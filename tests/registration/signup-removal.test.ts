import { describe, expect, it } from "vitest";

import { canDeleteSignup } from "@/lib/registration/signup-removal";

describe("canDeleteSignup", () => {
  it("allows removing a sign-up nobody paid for", () => {
    expect(canDeleteSignup([])).toEqual({ canDelete: true });
  });

  // Roslyn Ng: a test entry whose $340 PayPal request was cancelled. Nothing
  // happened, and the request only ever existed to be chased.
  it("allows removing one whose request was cancelled or is still pending", () => {
    expect(canDeleteSignup([{ status: "cancelled" }])).toEqual({
      canDelete: true,
    });
    expect(canDeleteSignup([{ status: "pending" }])).toEqual({
      canDelete: true,
    });
  });

  // The payment rows cascade off the sign-up, so this delete would take the
  // ledger entry and the fee owed on it with it.
  it("refuses once the money has actually arrived", () => {
    const check = canDeleteSignup([{ status: "paid" }]);
    expect(check.canDelete).toBe(false);
    expect(check).toMatchObject({ reason: expect.stringContaining("paid") });
  });

  it("refuses on a refund, and says so", () => {
    const check = canDeleteSignup([{ status: "refunded" }]);
    expect(check.canDelete).toBe(false);
    expect(check).toMatchObject({ reason: expect.stringContaining("refund") });
  });

  it("refuses when any one payment moved money, whatever else is there", () => {
    expect(
      canDeleteSignup([
        { status: "cancelled" },
        { status: "paid" },
        { status: "pending" },
      ]).canDelete,
    ).toBe(false);
  });

  it("names the payment, not the refund, when both exist", () => {
    const check = canDeleteSignup([{ status: "paid" }, { status: "refunded" }]);
    expect(check).toMatchObject({ reason: expect.stringContaining("paid") });
  });

  /**
   * The wording is the fix, not a detail. This used to read "refund it first,
   * or leave them withdrawn" — and for an individual the organizer UI offered
   * neither: there was no Withdraw control at all, and the refund dialog is
   * team-and-Stripe only. BVL's organizer went looking for an INDY payment
   * screen that does not exist. Refusing is right; sending someone somewhere
   * that isn't there is not.
   */
  it("points at Withdraw, the one way out that exists", () => {
    for (const payments of [[{ status: "paid" }], [{ status: "refunded" }]]) {
      expect(canDeleteSignup(payments)).toMatchObject({
        reason: expect.stringContaining("Withdraw"),
      });
    }
  });
});
