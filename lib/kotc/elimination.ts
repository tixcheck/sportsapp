/**
 * King of the Court — pure elimination logic (no DB, no UI).
 *
 * Both an elimination pool AND the finals run the same loop: play a KotC round,
 * drop the lowest-ranked pair (by the existing total → longest-streak →
 * reached-first tiebreaker), repeat until exactly 3 remain. For an elimination
 * pool those 3 advance; for the finals those 3 ARE the podium (1st/2nd/3rd by
 * their rank in the last round). The consolation is a single round (one winner)
 * and does NOT use this loop.
 *
 * These are the decision functions; "playing a round" and persistence live in
 * the actions. Ranking reuses rankKotcPool — no new tiebreaker logic here.
 */

import { rankKotcPool, type KotcPoolResult, type TeamId } from "./ranking";

/** Drop-rounds a pool/roster of `size` plays to get down to 3 (0 if already ≤3). */
export function eliminationRoundsNeeded(size: number): number {
  return Math.max(0, size - 3);
}

/** True once a pool/roster is down to its final 3 (or fewer) — stop dropping. */
export function eliminationComplete(remaining: number): boolean {
  return remaining <= 3;
}

/**
 * Drop the lowest-ranked pair after a round. `dropped` is the last row of
 * rankKotcPool; `remaining` is everyone else (in ranked order). `tied` is true
 * when the lowest is a genuine tie with the pair above it (rankKotcPool's
 * tiebreakStep 4 — equal on points, streak, AND reached-first). That can only
 * happen under manual entry (no rally log to break it); the caller must then ask
 * the organizer rather than drop arbitrarily. In live play distinct event seqs
 * always break it, so `tied` is false.
 */
export function dropLowest(results: KotcPoolResult[]): {
  dropped: TeamId;
  remaining: TeamId[];
  tied: boolean;
} {
  if (results.length === 0) {
    throw new Error("dropLowest needs at least one pair.");
  }
  const ranked = rankKotcPool(results);
  const last = ranked[ranked.length - 1];
  return {
    dropped: last.teamId,
    remaining: ranked.slice(0, -1).map((r) => r.teamId),
    tied: ranked.length >= 2 && last.tiebreakStep === 4,
  };
}

/** Every pair dropped across all elimination pools — the consolation field. */
export function gatherConsolation(pools: { eliminated: TeamId[] }[]): TeamId[] {
  return pools.flatMap((p) => p.eliminated);
}

/**
 * Compose the finals roster: the surviving trio from each elimination pool, plus
 * the consolation winner (if any). The finals pool then runs the same drop loop.
 */
export function composeFinals(
  advancersPerPool: TeamId[][],
  consolationWinner: TeamId | null,
): TeamId[] {
  return [
    ...advancersPerPool.flat(),
    ...(consolationWinner ? [consolationWinner] : []),
  ];
}
