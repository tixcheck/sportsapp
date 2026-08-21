import { describe, expect, it } from "vitest";

import {
  cardPaymentBlockedReason,
  paymentAccountStatus,
  type ConnectAccountFlags,
} from "@/lib/payments/account-status";

const flags = (
  over: Partial<ConnectAccountFlags> = {},
): ConnectAccountFlags => ({
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  disabledReason: null,
  requirementsDueCount: 0,
  ...over,
});

describe("cardPaymentBlockedReason", () => {
  it("does not block a fully live account", () => {
    expect(cardPaymentBlockedReason(flags())).toBeNull();
  });

  it("does NOT block an organizer whose payouts aren't released yet", () => {
    // The whole point: taking money and being paid out are separate. Stripe
    // holds a first payout for a week or two, and registration must not stop.
    const account = flags({ payoutsEnabled: false });
    expect(paymentAccountStatus(account).state).toBe("payouts_pending");
    expect(cardPaymentBlockedReason(account)).toBeNull();
  });

  it("says the organizer hasn't set card payments up, not that payouts are pending", () => {
    // The old copy blamed payouts in every case, which sent people looking in
    // the wrong place when the real answer was "they never connected Stripe".
    const reason = cardPaymentBlockedReason(null);
    expect(reason).toMatch(/hasn't set up card payments/i);
    expect(reason).not.toMatch(/payout/i);
  });

  it("distinguishes part-way onboarding from never having started", () => {
    const partway = cardPaymentBlockedReason(
      flags({ chargesEnabled: false, detailsSubmitted: false }),
    );
    expect(partway).toMatch(/part-way/i);
    expect(partway).not.toBe(cardPaymentBlockedReason(null));
  });

  it("tells the payer to wait when Stripe is still reviewing", () => {
    const reason = cardPaymentBlockedReason(
      flags({ chargesEnabled: false, payoutsEnabled: false }),
    );
    expect(reason).toMatch(/still reviewing/i);
  });

  it("never mentions payouts in any blocked message", () => {
    const cases = [
      null,
      flags({ chargesEnabled: false, detailsSubmitted: false }),
      flags({ chargesEnabled: false }),
      flags({ chargesEnabled: false, disabledReason: "requirements.past_due" }),
    ];
    for (const c of cases) {
      expect(cardPaymentBlockedReason(c)).not.toMatch(/payout/i);
    }
  });

  it("points a restricted account at the organizer rather than at Stripe", () => {
    const reason = cardPaymentBlockedReason(
      flags({ chargesEnabled: false, disabledReason: "requirements.past_due" }),
    );
    expect(reason).toMatch(/get in touch/i);
  });
});
