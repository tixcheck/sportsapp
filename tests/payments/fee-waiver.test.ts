import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLATFORM_FEE_RATES,
  WAIVED_PLATFORM_FEE_RATES,
  platformFeeCentsFor,
} from "@/lib/payments/platform-fee";

describe("waived platform fee", () => {
  /**
   * Free runs are a sales tool while the platform is being promoted, so the
   * waiver has to be complete: every type, every payer, every price.
   */
  it("takes nothing, whatever the type or payer", () => {
    for (const competitionType of ["league", "tournament", "kotc"] as const) {
      for (const payerMode of ["captain_pays_team", "player_share"] as const) {
        expect(
          platformFeeCentsFor({
            competitionType,
            payerMode,
            chargeBaseCents: 12_000,
            rates: WAIVED_PLATFORM_FEE_RATES,
          }),
        ).toBe(0);
      }
    }
  });

  it("is the only thing that changes — the usual rates still apply", () => {
    expect(
      platformFeeCentsFor({
        competitionType: "tournament",
        payerMode: "captain_pays_team",
        chargeBaseCents: 12_000,
        rates: DEFAULT_PLATFORM_FEE_RATES,
      }),
    ).toBe(120); // 1%
    expect(
      platformFeeCentsFor({
        competitionType: "league",
        payerMode: "player_share",
        chargeBaseCents: 12_000,
        rates: DEFAULT_PLATFORM_FEE_RATES,
      }),
    ).toBe(300); // flat $3
  });

  it("waives the platform's cut, not Stripe's", () => {
    // Every rate is zero, so nothing here can produce a platform fee. Stripe's
    // processing fee is charged by Stripe and is not ours to forgive — it is
    // computed in fees.ts from the gross, untouched by these rates.
    expect(Object.values(WAIVED_PLATFORM_FEE_RATES).every((v) => v === 0)).toBe(
      true,
    );
  });
});
