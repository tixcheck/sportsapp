import { describe, expect, it } from "vitest";

import {
  planIndividualCharge,
  planTeamCharge,
  type RegistrationPricing,
} from "@/lib/payments/registration-plan";
import { DEFAULT_PLATFORM_FEE_RATES } from "@/lib/payments/platform-fee";

const rates = DEFAULT_PLATFORM_FEE_RATES;

/** $400 a team, $65 a head — the two prices are unrelated by design. */
const pricing: RegistrationPricing = {
  registrationFeeCents: 40000,
  individualFeeCents: 6500,
  taxEnabled: false,
  taxPercent: 0,
};

describe("planIndividualCharge", () => {
  it("charges the individual fee, not the team fee", () => {
    const [c] = planIndividualCharge({
      pricing,
      competitionType: "league",
      payerEmail: "sam@example.com",
      rates,
    });
    expect(c.priceCents).toBe(6500);
    expect(c.kind).toBe("individual");
    expect(c.payerEmail).toBe("sam@example.com");
  });

  it("bills one person at the per-player rate, not the per-team rate", () => {
    // The whole point: a free agent is one payer, so they must not be charged
    // the platform's per-team fee.
    const [individual] = planIndividualCharge({
      pricing,
      competitionType: "league",
      payerEmail: "sam@example.com",
      rates,
    });
    const [team] = planTeamCharge({
      pricing,
      competitionType: "league",
      rates,
    });
    expect(individual.platformFeeCents).toBe(rates.leaguePerPlayerCents);
    expect(team.platformFeeCents).toBe(rates.leaguePerTeamCents);
    expect(individual.platformFeeCents).toBeLessThan(team.platformFeeCents);
  });

  it("returns nothing when individual sign-up is free", () => {
    expect(
      planIndividualCharge({
        pricing: { ...pricing, individualFeeCents: 0 },
        competitionType: "league",
        payerEmail: "sam@example.com",
        rates,
      }),
    ).toEqual([]);
  });

  it("treats a missing individual fee as free, even when teams pay", () => {
    // An event that has always charged teams and never thought about free
    // agents must not accidentally bill them the team price.
    const noIndividualFee: RegistrationPricing = {
      registrationFeeCents: pricing.registrationFeeCents,
      taxEnabled: false,
      taxPercent: 0,
    };
    expect(
      planIndividualCharge({
        pricing: noIndividualFee,
        competitionType: "league",
        payerEmail: null,
        rates,
      }),
    ).toEqual([]);
  });

  it("taxes the fee but not the platform's cut", () => {
    const [c] = planIndividualCharge({
      pricing: { ...pricing, taxEnabled: true, taxPercent: 13 },
      competitionType: "league",
      payerEmail: "sam@example.com",
      rates,
    });
    expect(c.taxCents).toBe(Math.round((6500 * 13) / 100));
    // Tax is on the organizer's price alone — never on our fee.
    expect(c.taxCents).toBeLessThan(
      Math.round(((6500 + c.platformFeeCents) * 13) / 100),
    );
  });

  it("charges the payer the price, the tax and the fees together", () => {
    const [c] = planIndividualCharge({
      pricing: { ...pricing, taxEnabled: true, taxPercent: 13 },
      competitionType: "league",
      payerEmail: "sam@example.com",
      rates,
    });
    expect(c.totalCents).toBeGreaterThan(c.priceCents + c.taxCents);
    expect(Number.isInteger(c.totalCents)).toBe(true);
    expect(c.applicationFeeCents).toBeGreaterThanOrEqual(c.platformFeeCents);
  });

  it("prices a tournament on its own rate card", () => {
    const [c] = planIndividualCharge({
      pricing,
      competitionType: "tournament",
      payerEmail: "sam@example.com",
      rates,
    });
    expect(c.platformFeeCents).toBe(
      Math.round((6500 * rates.tournamentPercent) / 100),
    );
  });

  it("leaves the team charge exactly as it was", () => {
    // Regression: adding the individual fee to the pricing object must not
    // change what a team pays.
    const withFee = planTeamCharge({
      pricing,
      competitionType: "league",
      rates,
    });
    const withoutFee = planTeamCharge({
      pricing: { ...pricing, individualFeeCents: 0 },
      competitionType: "league",
      rates,
    });
    expect(withFee).toEqual(withoutFee);
  });
});
