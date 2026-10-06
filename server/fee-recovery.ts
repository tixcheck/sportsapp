import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { getPlatformFeeRatesFor } from "@/lib/queries/payments";
import {
  WAIVED_PLATFORM_FEE_RATES,
  type PlatformFeeRates,
} from "@/lib/payments/platform-fee";
import { recoverableCents } from "@/lib/payments/fee-recovery";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Recovering the platform fee on entries let in without a card payment, from
 * the organizer's later card payments (0151 — Helix only, one per payment).
 *
 * Every team card checkout does three things with this:
 *   1. `ratesForTeamPayment` — if THIS team's fee was already recovered from
 *      someone else's payment, its own payment carries no platform fee; the
 *      platform takes it once.
 *   2. `claimFeeRecovery` before creating the session — one owed fee, added to
 *      the session's `application_fee_amount`. It comes out of the
 *      organizer's share; the payer pays the normal price.
 *   3. `attachFeeRecovery` once the session is stored, or `releaseFeeRecovery`
 *      if anything failed — so an abandoned attempt never holds a debt.
 * The webhook marks it recovered when the payment lands, and releases it if
 * the session expires or the payment is fully refunded.
 */
export type FeeRecovery = { id: string; cents: number };

export async function ratesForTeamPayment(
  supabase: Supabase,
  competitionId: string,
  teamId: string,
): Promise<PlatformFeeRates> {
  const [rates, { data: recovered }] = await Promise.all([
    getPlatformFeeRatesFor(competitionId),
    supabase.rpc("team_fee_already_recovered", { _team_id: teamId }),
  ]);
  return recovered === true ? WAIVED_PLATFORM_FEE_RATES : rates;
}

export async function claimFeeRecovery(
  supabase: Supabase,
  payingTeamId: string,
  priceCents: number,
): Promise<FeeRecovery | null> {
  const { data, error } = await supabase.rpc("claim_platform_fee_debt", {
    _paying_team_id: payingTeamId,
  });
  if (error) {
    // Never block a payment over the platform's own bookkeeping.
    console.error("[fee-recovery] claim failed");
    return null;
  }
  const row = (
    data as { recovery_id: string; amount_cents: number }[] | null
  )?.[0];
  if (!row) return null;
  const cents = recoverableCents(row.amount_cents, priceCents);
  if (cents === 0) {
    await releaseFeeRecovery(supabase, { id: row.recovery_id, cents: 0 });
    return null;
  }
  return { id: row.recovery_id, cents };
}

export async function attachFeeRecovery(
  supabase: Supabase,
  recovery: FeeRecovery | null,
  sessionId: string,
): Promise<void> {
  if (!recovery) return;
  const { error } = await supabase.rpc("attach_platform_fee_recovery", {
    _recovery_id: recovery.id,
    _session_id: sessionId,
  });
  if (error) console.error("[fee-recovery] attach failed");
}

export async function releaseFeeRecovery(
  supabase: Supabase,
  recovery: FeeRecovery | null,
): Promise<void> {
  if (!recovery) return;
  const { error } = await supabase.rpc("release_platform_fee_recovery", {
    _recovery_id: recovery.id,
  });
  if (error) console.error("[fee-recovery] release failed");
}
