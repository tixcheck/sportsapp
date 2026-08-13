import { describe, expect, it } from "vitest";

import {
  planMemberShares,
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

  it("reopens a balance when a settled charge is partially refunded", () => {
    // $480 collected, then $120 of the payer's total handed back. The price
    // portion comes back pro rata, so the team is short again.
    const s = teamPaymentState(
      [
        {
          status: "paid",
          priceCents: 48_000,
          totalCents: 50_000,
          refundedCents: 12_500,
        },
      ],
      fee,
    );
    expect(s.state).toBe("partial");
    expect(s.paidPriceCents).toBe(36_000);
    expect(s.outstandingPriceCents).toBe(12_000);
  });

  it("counts the full price when a charge carries no refund fields", () => {
    // Rows written before Slice C have no refunded_cents; they are not refunds.
    const s = teamPaymentState([{ status: "paid", priceCents: 48_000 }], fee);
    expect(s.paidPriceCents).toBe(48_000);
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

describe("planMemberShares", () => {
  const rates = DEFAULT_PLATFORM_FEE_RATES;
  const members = [
    { email: "a@x.com", name: "Ana", userId: "u1" },
    { email: "b@x.com", name: "Bo", userId: "u2" },
    { email: "c@x.com", name: "Cy", userId: "u3" },
  ];
  const base = {
    pricing: priced({ registrationFeeCents: 9_000 }),
    competitionType: "league" as const,
    rates,
    members,
  };

  it("splits evenly when nobody has started", () => {
    const shares = planMemberShares({ ...base, existingShares: [] });
    expect(shares.map((s) => s.priceCents)).toEqual([3_000, 3_000, 3_000]);
    expect(shares.every((s) => s.status === "owed")).toBe(true);
    // Each is quoted a chargeable total above their share.
    for (const s of shares) expect(s.totalCents!).toBeGreaterThan(s.priceCents);
  });

  it("keeps a paid share frozen and re-divides only the remainder", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "paid",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });

    expect(shares[0]).toMatchObject({ status: "paid", priceCents: 3_000 });
    // $60 left across the two who haven't started.
    expect(shares[1].priceCents).toBe(3_000);
    expect(shares[2].priceCents).toBe(3_000);
  });

  it("re-divides the remainder when the roster grows after a payment", () => {
    const shares = planMemberShares({
      ...base,
      members: [...members, { email: "d@x.com", name: "Di", userId: "u4" }],
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "paid",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });

    // $60 remaining over three unstarted players — $20 each, and the payer
    // who already settled is untouched.
    expect(shares[0]).toMatchObject({ status: "paid", priceCents: 3_000 });
    expect(shares.slice(1).map((s) => s.priceCents)).toEqual([
      2_000, 2_000, 2_000,
    ]);
    // The organizer still nets exactly the team fee.
    expect(shares.reduce((sum, s) => sum + s.priceCents, 0)).toBe(9_000);
  });

  it("treats a pending share as committed, not up for redivision", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "pending",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });
    expect(shares[0].status).toBe("pending");
    // Their frozen total is what Stripe will charge — shown, not recomputed.
    expect(shares[0].totalCents).toBe(3_430);
  });

  it("frees a cancelled share back up for redivision", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "cancelled",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });
    expect(shares.every((s) => s.status === "owed")).toBe(true);
    expect(shares.map((s) => s.priceCents)).toEqual([3_000, 3_000, 3_000]);
  });

  it("reopens a refunded share", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "refunded",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });
    expect(shares[0].status).toBe("owed");
  });

  it("lets a later paid row win over an earlier refund for the same payer", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "refunded",
          priceCents: 3_000,
          totalCents: 3_430,
        },
        {
          payerEmail: "a@x.com",
          status: "paid",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });
    expect(shares[0].status).toBe("paid");
  });

  it("matches payers case-insensitively", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "  A@X.com ",
          status: "paid",
          priceCents: 3_000,
          totalCents: 3_430,
        },
      ],
    });
    expect(shares[0].status).toBe("paid");
  });

  it("owes nothing more once the fee is fully covered", () => {
    const shares = planMemberShares({
      ...base,
      existingShares: [
        {
          payerEmail: "a@x.com",
          status: "paid",
          priceCents: 4_500,
          totalCents: 5_000,
        },
        {
          payerEmail: "b@x.com",
          status: "paid",
          priceCents: 4_500,
          totalCents: 5_000,
        },
      ],
    });
    expect(shares[2]).toMatchObject({
      status: "owed",
      priceCents: 0,
      totalCents: null,
    });
  });

  it("returns nothing for a free event or an empty roster", () => {
    expect(
      planMemberShares({
        ...base,
        pricing: priced({ registrationFeeCents: 0 }),
        existingShares: [],
      }),
    ).toEqual([]);
    expect(
      planMemberShares({ ...base, members: [], existingShares: [] }),
    ).toEqual([]);
  });
});
