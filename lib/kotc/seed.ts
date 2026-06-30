/**
 * King of the Court — pure seeding (no DB, no UI).
 *
 * Seed metric: NORMALIZED POOL PLACEMENT, averaged over the seeding rounds.
 * Raw cumulative King points aren't comparable across pools (pools differ in
 * strength and size), so we seed on placement instead — pool-relative (cancels
 * strength) and normalized to [0,1] by pool size (a 4-pool and a 6-pool compare
 * fairly). Same philosophy as crossPoolSeedOrder in lib/scheduler/tiebreakers.ts,
 * which normalizes pools onto ratios rather than raw totals.
 */

import { snakeDraftIntoSizes } from "@/lib/scheduler/pools";
import type { TeamId } from "./ranking";

/** A pair's finish in one seeding-round pool. */
export interface StagePlacement {
  teamId: TeamId;
  /** 1-based finishing rank in the pool. */
  rank: number;
  /** Number of pairs in that pool. */
  poolSize: number;
  /** Cumulative King points in that pool (a tiebreaker only). */
  kingPoints: number;
}

export interface KotcSeed {
  teamId: TeamId;
  /** Mean normalized placement across rounds, [0,1], higher = better. */
  seedScore: number;
  /** Sum of cumulative King points across rounds (seed tiebreaker). */
  totalPoints: number;
  /** 1-based seed. */
  seedRank: number;
}

/** 1st → 1.0, last → 0.0; a 1-pair pool is 1.0 (degenerate). */
export function normalizedPlacement(rank: number, poolSize: number): number {
  if (poolSize <= 1) return 1;
  return (poolSize - rank) / (poolSize - 1);
}

/**
 * Combine seeding-round placements into an overall seed. `stages` is one entry
 * per seeding round; each entry lists every pair's placement that round.
 * Tiebreakers on equal seed score: total points (desc), then best single-round
 * placement (desc), then team id (stable).
 */
export function computeKotcSeeds(stages: StagePlacement[][]): KotcSeed[] {
  const acc = new Map<
    TeamId,
    { sumNorm: number; n: number; totalPoints: number; bestNorm: number }
  >();

  for (const stage of stages) {
    for (const p of stage) {
      const norm = normalizedPlacement(p.rank, p.poolSize);
      const cur = acc.get(p.teamId) ?? {
        sumNorm: 0,
        n: 0,
        totalPoints: 0,
        bestNorm: 0,
      };
      cur.sumNorm += norm;
      cur.n += 1;
      cur.totalPoints += p.kingPoints;
      cur.bestNorm = Math.max(cur.bestNorm, norm);
      acc.set(p.teamId, cur);
    }
  }

  const rows = [...acc.entries()].map(([teamId, v]) => ({
    teamId,
    seedScore: v.sumNorm / v.n, // every team has at least one stage (n ≥ 1)
    totalPoints: v.totalPoints,
    bestNorm: v.bestNorm,
  }));

  rows.sort(
    (a, b) =>
      b.seedScore - a.seedScore ||
      b.totalPoints - a.totalPoints ||
      b.bestNorm - a.bestNorm ||
      (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0),
  );

  return rows.map((r, i) => ({
    teamId: r.teamId,
    seedScore: r.seedScore,
    totalPoints: r.totalPoints,
    seedRank: i + 1,
  }));
}

/**
 * Draft the seeded pairs into elimination pools, serpentine, so each pool gets a
 * balanced slice of seeds. Reuses the existing snake draft; the organizer tweaks
 * the result before locking.
 */
export function seedElimination(
  seedOrder: TeamId[],
  sizes: number[],
): TeamId[][] {
  return snakeDraftIntoSizes(seedOrder, sizes);
}

/**
 * Split `total` pairs into evenly-sized pools of about `perPool` each. Sizes
 * differ by at most 1; the larger pools come first. Handles counts that aren't a
 * clean multiple of `perPool` (e.g. 15 → [5,5,5]; 15 with perPool 4 → [4,4,4,3]).
 */
export function evenPoolSizes(total: number, perPool: number): number[] {
  const poolCount = Math.max(1, Math.round(total / Math.max(1, perPool)));
  const base = Math.floor(total / poolCount);
  const extra = total % poolCount;
  return Array.from({ length: poolCount }, (_, i) =>
    i < extra ? base + 1 : base,
  );
}
