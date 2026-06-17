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

export interface SeedTeam {
  id: TeamId;
  divisionId: string | null;
  seed: number | null;
}

/**
 * Resolve the seed order per division for pool generation. Pooling depends only
 * on a team being attached to the tournament — invite/claim status is not an
 * input here, so unclaimed teams are always included. `hint` is the organizer's
 * manual order; any team missing from the hint (e.g. a stale client) is still
 * included, appended by seed. Teams with no division group under "" (the caller
 * decides whether to pool them).
 */
export function resolveSeedOrder(
  teams: SeedTeam[],
  hint: Record<string, TeamId[]> = {},
): Record<string, TeamId[]> {
  const byDivision = new Map<string, SeedTeam[]>();
  for (const t of teams) {
    const key = t.divisionId ?? "";
    const list = byDivision.get(key) ?? [];
    list.push(t);
    byDivision.set(key, list);
  }

  const result: Record<string, TeamId[]> = {};
  for (const [division, list] of byDivision) {
    const present = new Set(list.map((t) => t.id));
    const seen = new Set<TeamId>();
    const order: TeamId[] = [];
    for (const id of hint[division] ?? []) {
      if (present.has(id) && !seen.has(id)) {
        order.push(id);
        seen.add(id);
      }
    }
    const remaining = list
      .filter((t) => !seen.has(t.id))
      .sort(
        (a, b) =>
          (a.seed ?? Number.MAX_SAFE_INTEGER) -
          (b.seed ?? Number.MAX_SAFE_INTEGER),
      );
    for (const t of remaining) order.push(t.id);
    result[division] = order;
  }
  return result;
}

// --- pool-play court/time layout (Phase 5b) --------------------------------

export interface ScheduledPoolMatch {
  /** Index into the ordered pools array passed to layoutPoolSchedule. */
  poolIndex: number;
  /** 1-based court number. */
  court: number;
  /** 0-based time-slot on that court. */
  slot: number;
  /** Pairing round (metadata for grouping/standings). */
  round: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /**
   * The pool team reffing this match — a team in the pool not playing it,
   * preferring whoever plays the next match (reffing crossover). Null only when
   * the pool has no non-playing team (e.g. a 2-team pool).
   */
  refTeamId: TeamId | null;
}

export interface LayoutPool {
  teamIds: TeamId[];
  rounds: PairingRound[];
}

/**
 * Lay out pool-play matches: each pool's matches run sequentially in
 * non-overlapping slots on a single court (reffing crossover — one match plays
 * while other pool teams ref/rest). Pools are assigned to courts round-robin;
 * when pools outnumber courts, later pools queue into later waves on the same
 * court. No court hosts two matches in the same slot.
 */
export function layoutPoolSchedule(
  pools: LayoutPool[],
  courts: number,
): ScheduledPoolMatch[] {
  const courtCount = Math.max(1, courts);
  const nextSlot = new Array<number>(courtCount).fill(0);
  const out: ScheduledPoolMatch[] = [];

  pools.forEach((pool, poolIndex) => {
    const court = poolIndex % courtCount; // 0-based
    const start = nextSlot[court];

    // Flatten this pool's matches into play order.
    const seq = pool.rounds.flatMap((r) =>
      r.pairs.map((p) => ({
        round: r.round,
        home: p.homeTeamId,
        away: p.awayTeamId,
      })),
    );

    seq.forEach((m, k) => {
      const playing = new Set<TeamId>([m.home, m.away]);
      const candidates = pool.teamIds.filter((id) => !playing.has(id));
      const next = seq[k + 1];
      // Prefer the team that plays next; else any non-playing pool team
      // (designated ref for the pool's final match).
      const ref =
        (next
          ? candidates.find((id) => id === next.home || id === next.away)
          : undefined) ??
        candidates[0] ??
        null;

      out.push({
        poolIndex,
        court: court + 1,
        slot: start + k,
        round: m.round,
        homeTeamId: m.home,
        awayTeamId: m.away,
        refTeamId: ref,
      });
    });

    nextSlot[court] = start + seq.length; // next pool on this court starts after
  });

  return out;
}

/** Invariant check: returns any (court, slot) pairs used by more than one match. */
export function detectCourtTimeCollisions(
  matches: { court: number; slot: number }[],
): { court: number; slot: number }[] {
  const seen = new Set<string>();
  const collisions: { court: number; slot: number }[] = [];
  for (const m of matches) {
    const key = `${m.court}@${m.slot}`;
    if (seen.has(key)) collisions.push({ court: m.court, slot: m.slot });
    else seen.add(key);
  }
  return collisions;
}
