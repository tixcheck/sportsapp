/**
 * Smart pool scheduling — slice 3, part 1: fair single-court match ordering.
 *
 * A pool plays its games sequentially on one court (this is what lets the
 * non-playing teams ref — see assignPoolRefs). The ORDER of those games decides
 * how evenly each team's rest is spread and whether a team plays back-to-back.
 * This module reorders a pool's circle-method pairings (from generatePairings)
 * to minimize rest-gap variance and avoidable back-to-backs.
 *
 * Pure + deterministic (no RNG): the same input always yields the same order,
 * which matters for stable schedule regeneration and exact tests. The result is
 * tie-broken to the baseline (rounds flattened in round order), so it is never
 * worse than the current layout on the cost function.
 */

import type { PairingRound, TeamId } from "@/lib/scheduler/round-robin";

export interface OrderedMatch {
  /** Pairing round the match came from (metadata for grouping/standings). */
  round: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
}

export interface RestStats {
  /** Every team's between-games rest gaps, pooled (gap of 1 = back-to-back). */
  gaps: number[];
  /** Population variance of the gaps — lower = more even waits. */
  variance: number;
  /** How many gaps equal 1 (a team playing two consecutive slots). */
  backToBacks: number;
  maxGap: number;
  minGap: number;
}

// A back-to-back (no rest at all) is the worst outcome for a team, so it
// dominates the cost; rest-gap variance is the secondary objective.
const BACK_TO_BACK_WEIGHT = 100;

// Brute-force the global optimum for small pools (≤7 matches ⇒ ≤5040 perms,
// trivial). 4-team (6 matches) and 3-team double-RR (6) land here, so they hit
// the proven-optimal order. Larger pools use multi-seed local search.
const BRUTE_FORCE_MAX = 7;

/**
 * Per-team rest gaps for an ordered match list. A team's gaps are the
 * differences between the slot indices where it plays; leading/trailing idle
 * time is not a gap *between* two of its games and is excluded.
 */
export function restGapStats(
  order: OrderedMatch[],
  teamIds: TeamId[],
): RestStats {
  const positions = new Map<TeamId, number[]>(teamIds.map((id) => [id, []]));
  order.forEach((m, slot) => {
    positions.get(m.homeTeamId)?.push(slot);
    positions.get(m.awayTeamId)?.push(slot);
  });

  const gaps: number[] = [];
  for (const slots of positions.values()) {
    for (let i = 1; i < slots.length; i++) gaps.push(slots[i] - slots[i - 1]);
  }

  if (gaps.length === 0) {
    return { gaps, variance: 0, backToBacks: 0, maxGap: 0, minGap: 0 };
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
  return {
    gaps,
    variance,
    backToBacks: gaps.filter((g) => g === 1).length,
    maxGap: Math.max(...gaps),
    minGap: Math.min(...gaps),
  };
}

/** Lower is better: back-to-backs dominate, then rest-gap variance. */
export function orderCost(order: OrderedMatch[], teamIds: TeamId[]): number {
  const s = restGapStats(order, teamIds);
  return s.backToBacks * BACK_TO_BACK_WEIGHT + s.variance;
}

/** Flatten the pairing rounds in round order — the current ("baseline") order. */
function flatten(rounds: PairingRound[]): OrderedMatch[] {
  return rounds.flatMap((r) =>
    r.pairs.map((p) => ({
      round: r.round,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
    })),
  );
}

/**
 * Greedy "spread" seed: fill slots one at a time, each time picking the match
 * whose two teams have rested the longest (maximize the smaller of the two
 * rests), so nobody is pulled into a back-to-back while a rested team waits.
 * Ties break to the earliest baseline index ⇒ deterministic.
 */
function greedySpread(baseline: OrderedMatch[]): OrderedMatch[] {
  const remaining = baseline.map((m, i) => ({ m, i }));
  const lastPlayed = new Map<TeamId, number>();
  const out: OrderedMatch[] = [];

  for (let slot = 0; slot < baseline.length; slot++) {
    const restOf = (id: TeamId) =>
      slot - (lastPlayed.has(id) ? lastPlayed.get(id)! : -Infinity);
    let bestIdx = 0;
    let bestKey = -Infinity;
    let bestSum = -Infinity;
    remaining.forEach(({ m }, idx) => {
      const r1 = restOf(m.homeTeamId);
      const r2 = restOf(m.awayTeamId);
      const minRest = Math.min(r1, r2);
      const sumRest = r1 + r2;
      // Maximize the worse-rested team first, then total rest; ties → earlier
      // baseline index (remaining is kept in baseline order).
      if (minRest > bestKey || (minRest === bestKey && sumRest > bestSum)) {
        bestKey = minRest;
        bestSum = sumRest;
        bestIdx = idx;
      }
    });
    const [picked] = remaining.splice(bestIdx, 1);
    out.push(picked.m);
    lastPlayed.set(picked.m.homeTeamId, slot);
    lastPlayed.set(picked.m.awayTeamId, slot);
  }
  return out;
}

/** All permutations of indices [0..n-1], yielded into `visit` (n ≤ 7 only). */
function eachPermutation(n: number, visit: (perm: number[]) => void): void {
  const perm = Array.from({ length: n }, (_, i) => i);
  const c = new Array<number>(n).fill(0);
  visit(perm.slice());
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      const swap = i % 2 === 0 ? 0 : c[i];
      [perm[swap], perm[i]] = [perm[i], perm[swap]];
      visit(perm.slice());
      c[i] += 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}

/** Exhaustive search (small pools): the cost-minimal order, ties → baseline. */
function bruteForce(
  baseline: OrderedMatch[],
  teamIds: TeamId[],
): OrderedMatch[] {
  let best = baseline;
  let bestCost = orderCost(baseline, teamIds);
  eachPermutation(baseline.length, (perm) => {
    const candidate = perm.map((i) => baseline[i]);
    const cost = orderCost(candidate, teamIds);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  });
  return best;
}

/**
 * Local search (larger pools): hill-climb a seed using 2-swap and single-move
 * neighborhoods, taking the best strict improvement each pass until none
 * remains. Deterministic — neighborhoods are scanned in fixed index order.
 */
function hillClimb(seed: OrderedMatch[], teamIds: TeamId[]): OrderedMatch[] {
  let current = seed.slice();
  let currentCost = orderCost(current, teamIds);
  const n = current.length;

  for (;;) {
    let bestOrder: OrderedMatch[] | null = null;
    let bestCost = currentCost;

    // 2-swaps.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const next = current.slice();
        [next[i], next[j]] = [next[j], next[i]];
        const cost = orderCost(next, teamIds);
        if (cost < bestCost) {
          bestCost = cost;
          bestOrder = next;
        }
      }
    }
    // Single-moves (remove at i, reinsert at j).
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const next = current.slice();
        const [moved] = next.splice(i, 1);
        next.splice(j, 0, moved);
        const cost = orderCost(next, teamIds);
        if (cost < bestCost) {
          bestCost = cost;
          bestOrder = next;
        }
      }
    }

    if (!bestOrder) break; // local optimum
    current = bestOrder;
    currentCost = bestCost;
  }
  return current;
}

/**
 * Order a pool's matches for fair single-court play. Reorders the circle-method
 * pairings to minimize back-to-backs then rest-gap variance. Never changes which
 * games exist or their home/away orientation (standings depend on it), and is
 * guaranteed no worse than the round-order baseline on the cost function.
 */
export function orderPoolMatches(
  teamIds: TeamId[],
  rounds: PairingRound[],
): OrderedMatch[] {
  const baseline = flatten(rounds);
  if (baseline.length <= 2) return baseline; // 0/1 games: nothing to order

  if (baseline.length <= BRUTE_FORCE_MAX) {
    return bruteForce(baseline, teamIds);
  }

  // Multi-seed local search; baseline is included and processed first so ties
  // resolve to it ⇒ never worse than the current order, fully deterministic.
  const candidates = [
    baseline,
    hillClimb(baseline, teamIds),
    hillClimb(greedySpread(baseline), teamIds),
  ];
  let best = candidates[0];
  let bestCost = orderCost(best, teamIds);
  for (const c of candidates) {
    const cost = orderCost(c, teamIds);
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
    }
  }
  return best;
}
