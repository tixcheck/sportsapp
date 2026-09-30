/**
 * Which platform fee applies to a given registration payment.
 *
 * The locked rates (2026-07-30) are shaped differently per competition type:
 * tournaments take a percentage, leagues take a flat amount whose size depends
 * on WHO is paying — $3 from each player paying their own share, or $20 once
 * from a captain paying for the whole team.
 *
 * Pure, with the rates passed in: they live in `platform_fee_settings` and are
 * admin-editable, so reading them here would both hide a DB call inside a
 * calculation and make this untestable.
 */

import type { competitionType } from "@/lib/db/schema";

export type CompetitionType = (typeof competitionType.enumValues)[number];

/** Who is paying this particular charge. */
export type PayerMode =
  /** One payment covering the team's whole fee. */
  | "captain_pays_team"
  /** One player's share of a split team fee. */
  | "player_share";

/** Mirrors `platform_fee_settings`. Percent is a percent (1 = 1%), not a fraction. */
export type PlatformFeeRates = {
  tournamentPercent: number;
  leaguePerPlayerCents: number;
  leaguePerTeamCents: number;
  /** Reverse Pairs: flat per pair registration (0143). */
  reversePairsPerPairCents: number;
};

export const DEFAULT_PLATFORM_FEE_RATES: PlatformFeeRates = {
  tournamentPercent: 1,
  leaguePerPlayerCents: 300,
  leaguePerTeamCents: 2000,
  reversePairsPerPairCents: 200,
};

/**
 * Rates for a competition the platform fee has been waived on.
 *
 * Expressed as zeroed RATES rather than a flag threaded through every caller,
 * because the fee is already computed from rates in six places and a seventh
 * argument at each one is six chances to forget it. Zero rates give zero fee
 * everywhere by construction.
 *
 * This waives only the PLATFORM's cut. Stripe still takes its processing fee —
 * that is Stripe's money, not ours to forgive.
 */
export const WAIVED_PLATFORM_FEE_RATES: PlatformFeeRates = {
  tournamentPercent: 0,
  leaguePerPlayerCents: 0,
  leaguePerTeamCents: 0,
  reversePairsPerPairCents: 0,
};

/**
 * The platform's cut for one charge, in cents.
 *
 * `chargeBaseCents` is the organizer's net for THIS charge — a whole team fee
 * for `captain_pays_team`, one player's share for `player_share`. The
 * percentage types care about it; the flat league rates don't.
 *
 * KotC is priced like a tournament: a one-off event with an entry fee, which is
 * what the tournament percentage was chosen for. Leagues are flat because
 * they're the recurring, per-player product. Reverse Pairs is flat per pair
 * (0143, the owner's rate): a pair is the unit people sign up and pay as.
 */
export function platformFeeCentsFor({
  competitionType,
  payerMode,
  chargeBaseCents,
  rates = DEFAULT_PLATFORM_FEE_RATES,
}: {
  competitionType: CompetitionType;
  payerMode: PayerMode;
  chargeBaseCents: number;
  rates?: PlatformFeeRates;
}): number {
  if (!Number.isInteger(chargeBaseCents) || chargeBaseCents < 0) {
    throw new Error("chargeBaseCents must be a non-negative integer of cents.");
  }

  // A free registration is free — we don't take a cut of nothing, and a flat
  // league fee on a $0 event would be the platform charging for a giveaway.
  if (chargeBaseCents === 0) return 0;

  if (competitionType === "league") {
    return payerMode === "player_share"
      ? rates.leaguePerPlayerCents
      : rates.leaguePerTeamCents;
  }

  // Reverse Pairs: flat per pair. A partner paying their own share pays half
  // of it — a pair is two people, and the two halves must add back to the
  // pair's fee, not charge it twice.
  if (competitionType === "reverse_pairs") {
    return payerMode === "player_share"
      ? Math.round(rates.reversePairsPerPairCents / 2)
      : rates.reversePairsPerPairCents;
  }

  // Tournament and KotC: a percentage of what's being charged. Rounded to the
  // nearest cent — the gross-up in fees.ts absorbs the rounding either way.
  return Math.round((chargeBaseCents * rates.tournamentPercent) / 100);
}
