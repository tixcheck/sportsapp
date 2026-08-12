import { describe, expect, it } from "vitest";

import {
  planSplitCharges,
  planTeamCharge,
  teamPaymentState,
  type RegistrationPricing,
} from "@/lib/payments/registration-plan";
import { DEFAULT_PLATFORM_FEE_RATES } from "@/lib/payments/platform-fee";

const rates = DEFAULT_PLATFORM_FEE_RATES;
const priced = (
  over: Partial<RegistrationPricing> = {},
): RegistrationPricing => ({
  registrationFeeCents: 48_000,
  taxEnabled: false,
  taxPercent: 0,
  ...over,
});

describe("planTeamCharge", () => {
  it("produces one charge the organizer nets their price on", () => {
    const [charge] = planTeamCharge({
      pricing: priced(),
      competitionType: "league",
      rates,
    });

    expect(charge.kind).toBe("team_full");
    expect(charge.payerEmail).toBeNull();
    expect(charge.priceCents).toBe(48_000);
    expect(charge.platformFeeCents).toBe(2_000); // $20 per team
    // The balance the DB check constraint enforces.
    expect(charge.totalCents).toBe(
      charge.priceCents + charge.taxCents + charge.applicationFeeCents,
    );
  });

  it("returns nothing for a free event rather than a zero-amount charge", () => {
    expect(
      planTeamCharge({
        pricing: priced({ registrationFeeCents: 0 }),
        competitionType: "tournament",
        rates,
      }),
    ).toEqual([]);
  });

  it("adds tax on the price only, not on the fees layered on top", () => {
    const [withTax] = planTeamCharge({
      pricing: priced({ taxEnabled: true, taxPercent: 13 }),
      competitionType: "league",
      rates,
    });

    // 13% of $480, not of the grossed-up total.
    expect(withTax.taxCents).toBe(6_240);
    expect(withTax.totalCents).toBeGreaterThan(48_000 + 6_240);
  });

  it("ignores a tax percent when tax is switched off", () => {
    const [charge] = planTeamCharge({
      pricing: priced({ taxEnabled: false, taxPercent: 13 }),
      competitionType: "league",
      rates,
    });
    expect(charge.taxCents).toBe(0);
  });
});

describe("planSplitCharges", () => {
  const payers = ["a@x.com", "b@x.com", "c@x.com"];

  it("gives every payer their own chargeable share", () => {
    const charges = planSplitCharges({
      pricing: priced({ registrationFeeCents: 1_000 }),
      competitionType: "league",
      payerEmails: payers,
      rates,
    });

    expect(charges).toHaveLength(3);
    // Shares sum back to the team price — the organizer nets it exactly.
    expect(charges.reduce((s, c) => s + c.priceCents, 0)).toBe(1_000);
    // Remainder cent goes to the first payer.
    expect(charges.map((c) => c.priceCents)).toEqual([334, 333, 333]);
    // Each share carries its own per-player platform fee.
    for (const c of charges) expect(c.platformFeeCents).toBe(300);
  });

  it("normalises and dedupes payer emails", () => {
    const charges = planSplitCharges({
      pricing: priced(),
      competitionType: "league",
      payerEmails: ["  A@x.com ", "a@x.com", "b@x.com", "", "   "],
      rates,
    });

    expect(charges.map((c) => c.payerEmail)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("is stable — the same payer pays the remainder cent each time", () => {
    const args = {
      pricing: priced({ registrationFeeCents: 1_000 }),
      competitionType: "league" as const,
      payerEmails: payers,
      rates,
    };
    expect(planSplitCharges(args)).toEqual(planSplitCharges(args));
  });

  it("returns nothing when there are no payers, or the event is free", () => {
    expect(
      planSplitCharges({
        pricing: priced(),
        competitionType: "league",
        payerEmails: [],
        rates,
      }),
    ).toEqual([]);
    expect(
      planSplitCharges({
        pricing: priced({ registrationFeeCents: 0 }),
        competitionType: "league",
        payerEmails: payers,
        rates,
      }),
    ).toEqual([]);
  });

  it("every share balances to price + tax + application fee", () => {
    const charges = planSplitCharges({
      pricing: priced({ taxEnabled: true, taxPercent: 13 }),
      competitionType: "league",
      payerEmails: payers,
      rates,
    });
    for (const c of charges) {
      expect(c.totalCents).toBe(
        c.priceCents + c.taxCents + c.applicationFeeCents,
      );
    }
  });
});

describe("teamPaymentState", () => {
  const fee = { feeCents: 48_000 };

  it("reports a free event as free", () => {
    expect(teamPaymentState([], { feeCents: 0 }).state).toBe("free");
  });

  it("reports no rows on a priced event as unpaid, not free", () => {
    const s = teamPaymentState([], fee);
    expect(s.state).toBe("unpaid");
    expect(s.outstandingPriceCents).toBe(48_000);
  });

  it("reports paid once the fee is covered", () => {
    const s = teamPaymentState([{ status: "paid", priceCents: 48_000 }], fee);
    expect(s.state).toBe("paid");
    expect(s.outstandingPriceCents).toBe(0);
    expect(s.chargesOutstanding).toBe(0);
  });

  it("reports partial when some shares are in", () => {
    const s = teamPaymentState(
      [
        { status: "paid", priceCents: 16_000 },
        { status: "paid", priceCents: 16_000 },
        { status: "pending", priceCents: 16_000 },
      ],
      fee,
    );
    expect(s.state).toBe("partial");
    expect(s.paidPriceCents).toBe(32_000);
    expect(s.outstandingPriceCents).toBe(16_000);
    expect(s.chargesOutstanding).toBe(1);
  });

  it("ignores cancelled rows — an abandoned checkout is not a debt", () => {
    const s = teamPaymentState(
      [
        { status: "paid", priceCents: 48_000 },
        { status: "cancelled", priceCents: 48_000 },
      ],
      fee,
    );
    expect(s.state).toBe("paid");
    expect(s.chargesOutstanding).toBe(0);
  });

  it("treats a refund as money the organizer no longer has", () => {
    const s = teamPaymentState(
      [{ status: "refunded", priceCents: 48_000 }],
      fee,
    );
    expect(s.state).toBe("unpaid");
    expect(s.outstandingPriceCents).toBe(48_000);
  });

  it("does not go negative when more was collected than the fee", () => {
    const s = teamPaymentState([{ status: "paid", priceCents: 60_000 }], fee);
    expect(s.state).toBe("paid");
    expect(s.outstandingPriceCents).toBe(0);
  });
});
