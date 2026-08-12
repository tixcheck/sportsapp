import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLATFORM_FEE_RATES,
  platformFeeCentsFor,
} from "@/lib/payments/platform-fee";
import { quotePayment, splitEvenly } from "@/lib/payments/fees";

const base = { chargeBaseCents: 10_000 } as const;

describe("platformFeeCentsFor", () => {
  it("takes 1% on a tournament", () => {
    expect(
      platformFeeCentsFor({
        ...base,
        competitionType: "tournament",
        payerMode: "captain_pays_team",
      }),
    ).toBe(100);
  });

  it("prices KotC like a tournament — a one-off event with an entry fee", () => {
    expect(
      platformFeeCentsFor({
        ...base,
        competitionType: "kotc",
        payerMode: "captain_pays_team",
      }),
    ).toBe(100);
  });

  it("takes $20 once when a league captain pays for the team", () => {
    expect(
      platformFeeCentsFor({
        chargeBaseCents: 48_000,
        competitionType: "league",
        payerMode: "captain_pays_team",
      }),
    ).toBe(2_000);
  });

  it("takes $3 from each player paying their own league share", () => {
    expect(
      platformFeeCentsFor({
        chargeBaseCents: 8_000,
        competitionType: "league",
        payerMode: "player_share",
      }),
    ).toBe(300);
  });

  it("ignores the amount for flat league rates", () => {
    const cheap = platformFeeCentsFor({
      chargeBaseCents: 1_000,
      competitionType: "league",
      payerMode: "player_share",
    });
    const dear = platformFeeCentsFor({
      chargeBaseCents: 90_000,
      competitionType: "league",
      payerMode: "player_share",
    });
    expect(cheap).toBe(dear);
  });

  it("takes nothing on a free registration", () => {
    for (const type of ["league", "tournament", "kotc"] as const) {
      for (const mode of ["captain_pays_team", "player_share"] as const) {
        expect(
          platformFeeCentsFor({
            chargeBaseCents: 0,
            competitionType: type,
            payerMode: mode,
          }),
        ).toBe(0);
      }
    }
  });

  it("honours overridden rates (the admin-editable path)", () => {
    expect(
      platformFeeCentsFor({
        ...base,
        competitionType: "tournament",
        payerMode: "captain_pays_team",
        rates: { ...DEFAULT_PLATFORM_FEE_RATES, tournamentPercent: 2.5 },
      }),
    ).toBe(250);
  });

  it("rejects a negative or fractional amount", () => {
    expect(() =>
      platformFeeCentsFor({
        chargeBaseCents: -1,
        competitionType: "league",
        payerMode: "player_share",
      }),
    ).toThrow();
  });

  it("defaults to the locked rates", () => {
    expect(DEFAULT_PLATFORM_FEE_RATES).toEqual({
      tournamentPercent: 1,
      leaguePerPlayerCents: 300,
      leaguePerTeamCents: 2000,
    });
  });
});

describe("end-to-end pricing (platform fee + gross-up)", () => {
  it("reproduces the plan's tournament example", () => {
    const price = 10_000;
    const fee = platformFeeCentsFor({
      chargeBaseCents: price,
      competitionType: "tournament",
      payerMode: "captain_pays_team",
    });
    const q = quotePayment({ priceCents: price, platformFeeCents: fee });

    expect(q.organizerNetCents).toBe(10_000);
    expect(q.platformNetCents).toBe(100);
  });

  it("a split league team costs each player their share plus $3", () => {
    const teamPrice = 48_000;
    const shares = splitEvenly(teamPrice, 6);

    const quotes = shares.map((share) =>
      quotePayment({
        priceCents: share,
        platformFeeCents: platformFeeCentsFor({
          chargeBaseCents: share,
          competitionType: "league",
          payerMode: "player_share",
        }),
      }),
    );

    // The organizer still nets exactly the team price across all six charges.
    expect(quotes.reduce((sum, q) => sum + q.organizerNetCents, 0)).toBe(
      teamPrice,
    );
    // And the platform clears its $3 per player.
    for (const q of quotes)
      expect(q.platformNetCents).toBeGreaterThanOrEqual(300);
  });

  // Under the locked rates the crossover is ~6.15 players: per-team overhead is
  // $20 + one 30c Stripe fixed fee = $20.30, per-player is n x ($3 + 30c).
  // So splitting is CHEAPER at 6 or fewer payers and dearer at 7+. Worth
  // pinning: it is the opposite of the intuition that one payment costs less,
  // and it means indoor6/coed4/beach2 rosters are all on the cheap side.
  it("splitting is cheaper than captain-pays at 6 payers, dearer at 7", () => {
    const teamPrice = 48_000;

    const captain = quotePayment({
      priceCents: teamPrice,
      platformFeeCents: platformFeeCentsFor({
        chargeBaseCents: teamPrice,
        competitionType: "league",
        payerMode: "captain_pays_team",
      }),
    });

    const splitTotal = splitEvenly(teamPrice, 6)
      .map((share) =>
        quotePayment({
          priceCents: share,
          platformFeeCents: platformFeeCentsFor({
            chargeBaseCents: share,
            competitionType: "league",
            payerMode: "player_share",
          }),
        }),
      )
      .reduce((sum, q) => sum + q.totalCents, 0);

    // 6 x ($3 + 30c) = $19.80 < $20.30, so the team pays slightly less split.
    expect(splitTotal).toBeLessThan(captain.totalCents);

    const sevenWayTotal = splitEvenly(teamPrice, 7)
      .map((share) =>
        quotePayment({
          priceCents: share,
          platformFeeCents: platformFeeCentsFor({
            chargeBaseCents: share,
            competitionType: "league",
            payerMode: "player_share",
          }),
        }),
      )
      .reduce((sum, q) => sum + q.totalCents, 0);

    // 7 x $3.30 = $23.10 > $20.30 — past the crossover.
    expect(sevenWayTotal).toBeGreaterThan(captain.totalCents);
  });
});
