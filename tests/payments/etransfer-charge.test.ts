import { describe, expect, it } from "vitest";

import {
  planEtransferCharge,
  planTeamCharge,
  type RegistrationPricing,
} from "@/lib/payments/registration-plan";
import { DEFAULT_PLATFORM_FEE_RATES } from "@/lib/payments/platform-fee";

const rates = DEFAULT_PLATFORM_FEE_RATES;
const pricing: RegistrationPricing = {
  registrationFeeCents: 35000,
  taxEnabled: false,
  taxPercent: 0,
};

describe("planEtransferCharge", () => {
  it("asks for exactly the price — nothing grossed up", () => {
    // A card payer covers Stripe and our fee on top. An e-transfer has no
    // processing to cover and we never touch the money.
    const [c] = planEtransferCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates,
    });
    expect(c.totalCents).toBe(35000);
    expect(c.priceCents).toBe(35000);
  });

  it("charges the payer less than the card route for the same fee", () => {
    const [etransfer] = planEtransferCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates,
    });
    const [card] = planTeamCharge({
      pricing,
      competitionType: "league",
      rates,
    });
    expect(etransfer.totalCents).toBeLessThan(card.totalCents);
    // Both leave the organizer with the same price.
    expect(etransfer.priceCents).toBe(card.priceCents);
  });

  it("records the platform fee as owed, without adding it to the total", () => {
    // The fee is a debt the organizer settles later, not something the payer
    // covers — otherwise e-transfer would quietly cost the team more.
    const [c] = planEtransferCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates,
    });
    expect(c.platformFeeCents).toBe(rates.leaguePerTeamCents);
    expect(c.totalCents).toBe(c.priceCents + c.taxCents);
    // The fee is recorded but deliberately NOT part of what the payer sends.
    expect(c.totalCents).toBe(35000);
    expect(c.platformFeeCents).toBeGreaterThan(0);
  });

  it("reports no application fee, because Stripe collected nothing", () => {
    const [c] = planEtransferCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates,
    });
    expect(c.applicationFeeCents).toBe(0);
  });

  it("adds tax on top of the price, and the payer sends both", () => {
    const [c] = planEtransferCharge({
      pricing: { ...pricing, taxEnabled: true, taxPercent: 13 },
      competitionType: "league",
      payerEmail: null,
      rates,
    });
    expect(c.taxCents).toBe(Math.round((35000 * 13) / 100));
    expect(c.totalCents).toBe(35000 + c.taxCents);
  });

  it("returns nothing for a free event", () => {
    expect(
      planEtransferCharge({
        pricing: { ...pricing, registrationFeeCents: 0 },
        competitionType: "league",
        payerEmail: null,
        rates,
      }),
    ).toEqual([]);
  });

  it("prices a tournament on its own rate card", () => {
    const [c] = planEtransferCharge({
      pricing,
      competitionType: "tournament",
      payerEmail: null,
      rates,
    });
    expect(c.platformFeeCents).toBe(
      Math.round((35000 * rates.tournamentPercent) / 100),
    );
  });
});
