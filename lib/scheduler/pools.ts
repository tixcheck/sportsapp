/**
 * Tournament pool assignment + intra-pool scheduling (PRD §7). Pure: no DB.
 * Teams are distributed into pools by seed using a snake/serpentine draft
 * (1→A, 2→B, 3→C, 4→D, 5→D, 6→C, …) so pools are balanced by strength, then
 * each pool plays a round-robin (reusing the circle method from round-robin.ts).
 */

import {
  generatePairings,
  type PairingRound,
  type TeamId,
} from "./round-robin";

export interface PoolsInput {
  /** Team ids ordered by seed (best first = seed 1). */
  seededTeamIds: TeamId[];
  /** Preferred teams per pool. Default 4. */
  poolSize?: number;
}

export interface Pool {
  name: string;
  /** Court the pool plays on (adjacent courts for referee crossover). */
  court: number;
  teamIds: TeamId[];
  rounds: PairingRound[];
}

export interface PoolsResult {
  pools: Pool[];
}

function poolName(index: number): string {
  // A, B, …, Z, then AA, AB, … (more pools than 26 is unrealistic, but safe).
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export function assignPools(
  seededTeamIds: TeamId[],
  poolSize: number,
): TeamId[][] {
  const n = seededTeamIds.length;
  if (n === 0) return [];
  const poolCount = Math.max(1, Math.ceil(n / poolSize));
  const pools: TeamId[][] = Array.from({ length: poolCount }, () => []);

  seededTeamIds.forEach((teamId, i) => {
    const row = Math.floor(i / poolCount);
    const pos = i % poolCount;
    // Serpentine: even rows left→right, odd rows right→left.
    const poolIndex = row % 2 === 0 ? pos : poolCount - 1 - pos;
    pools[poolIndex].push(teamId);
  });

  return pools;
}

export function generatePools(input: PoolsInput): PoolsResult {
  const poolSize = input.poolSize ?? 4;
  const assignments = assignPools(input.seededTeamIds, poolSize);

  const pools: Pool[] = assignments.map((teamIds, i) => ({
    name: `Pool ${poolName(i)}`,
    court: i + 1,
    teamIds,
    rounds: generatePairings(teamIds, 1),
  }));

  return { pools };
}
