import { describe, expect, it } from "vitest";

import {
  type ConnectAccountFlags,
  paymentAccountStatus,
} from "@/lib/payments/account-status";

/** A fully-verified live account; each test overrides what it's about. */
function account(over: Partial<ConnectAccountFlags> = {}): ConnectAccountFlags {
  return {
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    disabledReason: null,
    requirementsDueCount: 0,
    ...over,
  };
}

describe("paymentAccountStatus", () => {
  it("treats a missing account as not connected, with an action to take", () => {
    expect(paymentAccountStatus(null)).toEqual({
      state: "not_connected",
      canAcceptPayments: false,
      needsAction: true,
      outstandingRequirements: 0,
    });
    expect(paymentAccountStatus(undefined).state).toBe("not_connected");
  });

  it("is active only when charges and payouts are both enabled", () => {
    const status = paymentAccountStatus(account());
    expect(status.state).toBe("active");
    expect(status.canAcceptPayments).toBe(true);
    expect(status.needsAction).toBe(false);
  });

  it("says onboarding when the organizer hasn't finished Stripe's form", () => {
    const status = paymentAccountStatus(
      account({ detailsSubmitted: false, chargesEnabled: false }),
    );
    expect(status.state).toBe("onboarding");
    expect(status.canAcceptPayments).toBe(false);
    expect(status.needsAction).toBe(true);
  });

  it("waits quietly while Stripe reviews a submitted account", () => {
    const status = paymentAccountStatus(
      account({ chargesEnabled: false, payoutsEnabled: false }),
    );
    expect(status.state).toBe("pending_review");
    // Nothing for the organizer to do — don't nag them.
    expect(status.needsAction).toBe(false);
  });

  it("asks for action when Stripe is waiting on requirements, not on itself", () => {
    const status = paymentAccountStatus(
      account({
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsDueCount: 3,
      }),
    );
    expect(status.state).toBe("restricted");
    expect(status.needsAction).toBe(true);
    expect(status.outstandingRequirements).toBe(3);
  });

  it("lets a first-payout hold keep taking registrations", () => {
    const status = paymentAccountStatus(account({ payoutsEnabled: false }));
    expect(status.state).toBe("payouts_pending");
    // The money still lands at Stripe; it just hasn't reached the bank yet.
    expect(status.canAcceptPayments).toBe(true);
    expect(status.needsAction).toBe(false);
  });

  it("a disabled reason wins over otherwise-healthy flags", () => {
    const status = paymentAccountStatus(
      account({ disabledReason: "requirements.past_due" }),
    );
    expect(status.state).toBe("restricted");
    expect(status.needsAction).toBe(true);
  });

  it("still reports a restricted account as chargeable if Stripe says so", () => {
    // Stripe can block payouts while leaving charges on; we must not silently
    // stop routing money that Stripe would happily accept.
    const status = paymentAccountStatus(
      account({ payoutsEnabled: false, disabledReason: "under_review" }),
    );
    expect(status.state).toBe("restricted");
    expect(status.canAcceptPayments).toBe(true);
  });

  it("never reports a negative requirement count", () => {
    expect(
      paymentAccountStatus(account({ requirementsDueCount: -1 }))
        .outstandingRequirements,
    ).toBe(0);
  });
});
