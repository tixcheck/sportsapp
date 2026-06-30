/**
 * King of the Court — pure fair re-pool for Round 2 (no DB, no UI).
 *
 * Goal: new pools that (a) balance pool strength from Round-1 results AND
 * (b) minimize rematches (pairs who shared a Round-1 pool sharing one again).
 *
 * Approach (mirrors the Slice-3 optimizer: deterministic greedy + local search):
 *   1. Serpentine the pairs (strongest first) into the target sizes → a
 *      strength-balanced baseline (reuses snakeDraftIntoSizes).
 *   2. Local search: 2-swap pairs between pools, accepting a swap that lowers the
 *      lexicographic cost (repeatCount, strengthVariance). Tie-broken to the
 *      baseline, so the result is never worse than serpentine and fully
 *      deterministic.
 * Zero repeats may be impossible with small pools, so the residual repeat count
 * is returned for the review UI.
 */

import { snakeDraftIntoSizes } from "@/lib/scheduler/pools";
import type { TeamId } from "./ranking";

export interface RepoolPair {
  teamId: TeamId;
  /** Round-1 strength (higher = stronger); orders the serpentine draft. */
  seedScore: number;
}

export interface RepoolResult {
  pools: TeamId[][];
  /** Residual repeat-poolmate count (0 = no rematches). */
  repeats: number;
}

/** Unordered "a|b" key for a pair of teams. */
function pairKey(a: TeamId, b: TeamId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Set of every within-pool pairing across the prior pools. */
function poolmateSet(pools: TeamId[][]): Set<string> {
  const s = new Set<string>();
  for (const pool of pools) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        s.add(pairKey(pool[i], pool[j]));
      }
    }
  }
  return s;
}

/** How many current poolmate pairs were also poolmates in `prior`. */
export function countRepeats(pools: TeamId[][], prior: TeamId[][]): number {
  const priorPairs = poolmateSet(prior);
  let n = 0;
  for (const pool of pools) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (priorPairs.has(pairKey(pool[i], pool[j]))) n += 1;
      }
    }
  }
  return n;
}

/** Variance of per-pool summed seed scores — lower = more balanced.
 * Every team in `pools` came from `pairs`, so `scoreOf` always has it; `pools`
 * is non-empty (built from a non-empty `sizes`). */
function strengthVariance(
  pools: TeamId[][],
  scoreOf: Map<TeamId, number>,
): number {
  const totals = pools.map((p) =>
    p.reduce((sum, t) => sum + scoreOf.get(t)!, 0),
  );
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  return totals.reduce((a, t) => a + (t - mean) ** 2, 0) / totals.length;
}

/** Lexicographic cost: fewer repeats first, then better balance. */
function cost(
  pools: TeamId[][],
  prior: TeamId[][],
  scoreOf: Map<TeamId, number>,
): [number, number] {
  return [countRepeats(pools, prior), strengthVariance(pools, scoreOf)];
}

function lessThan(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1] - 1e-9);
}

export function repoolForRound2(
  pairs: RepoolPair[],
  round1Pools: TeamId[][],
  sizes: number[],
): RepoolResult {
  const scoreOf = new Map(pairs.map((p) => [p.teamId, p.seedScore]));
  // Strongest first → serpentine baseline.
  const order = [...pairs]
    .sort(
      (a, b) =>
        b.seedScore - a.seedScore ||
        (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0),
    )
    .map((p) => p.teamId);

  const pools = snakeDraftIntoSizes(order, sizes); // mutated in place by swaps
  let best = cost(pools, round1Pools, scoreOf);

  // Local search: best-improving 2-swap across pools until no improvement.
  // Deterministic — pools/positions scanned in fixed order.
  for (;;) {
    let swap: { pi: number; ii: number; pj: number; jj: number } | null = null;
    let swapCost = best;

    for (let pi = 0; pi < pools.length; pi++) {
      for (let pj = pi + 1; pj < pools.length; pj++) {
        for (let ii = 0; ii < pools[pi].length; ii++) {
          for (let jj = 0; jj < pools[pj].length; jj++) {
            const cand = pools.map((p) => [...p]);
            [cand[pi][ii], cand[pj][jj]] = [cand[pj][jj], cand[pi][ii]];
            const c = cost(cand, round1Pools, scoreOf);
            if (lessThan(c, swapCost)) {
              swapCost = c;
              swap = { pi, ii, pj, jj };
            }
          }
        }
      }
    }

    if (!swap) break;
    const { pi, ii, pj, jj } = swap;
    [pools[pi][ii], pools[pj][jj]] = [pools[pj][jj], pools[pi][ii]];
    best = swapCost;
  }

  return { pools, repeats: best[0] };
}
