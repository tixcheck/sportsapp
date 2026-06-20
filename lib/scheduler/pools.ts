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
import type { MatchFormat } from "@/lib/db/schema";

/** Default minutes per match slot, shared by pool + bracket scheduling. */
export const DEFAULT_SLOT_MINUTES = 45;

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

export function poolName(index: number): string {
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

    // Balance the ref load within the pool (counts differ by ≤ 1), keeping the
    // reffing-crossover rule (whoever plays next) only as a tiebreaker.
    const refCount = new Map<TeamId, number>(pool.teamIds.map((id) => [id, 0]));
    const candidatesOf = (home: TeamId, away: TeamId) =>
      pool.teamIds.filter((id) => id !== home && id !== away);

    // Pass 1 — greedy least-loaded; ties → plays-next (crossover), then order.
    const refs: (TeamId | null)[] = seq.map((m, k) => {
      const candidates = candidatesOf(m.home, m.away);
      const next = seq[k + 1];
      const playsNext = (id: TeamId) =>
        !!next && (id === next.home || id === next.away);
      let ref: TeamId | null = null;
      for (const id of candidates) {
        if (ref === null) {
          ref = id;
          continue;
        }
        const delta = refCount.get(id)! - refCount.get(ref)!;
        if (delta < 0 || (delta === 0 && playsNext(id) && !playsNext(ref))) {
          ref = id;
        }
      }
      if (ref !== null) refCount.set(ref, refCount.get(ref)! + 1);
      return ref;
    });

    // Pass 2 — repair: greedy can strand a low-count team that plays the late
    // matches. Reassign a ref from an overloaded team to an underloaded
    // candidate until the spread is ≤ 1.
    let guard = pool.teamIds.length * seq.length + 1;
    while (guard-- > 0) {
      const counts = [...refCount.values()];
      if (Math.max(...counts) - Math.min(...counts) <= 1) break;
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      const over = new Set(
        [...refCount].filter(([, c]) => c === max).map(([id]) => id),
      );
      const under = new Set(
        [...refCount].filter(([, c]) => c === min).map(([id]) => id),
      );
      let swapped = false;
      for (let k = 0; k < seq.length; k++) {
        const r = refs[k];
        if (r === null || !over.has(r)) continue;
        const u = candidatesOf(seq[k].home, seq[k].away).find((id) =>
          under.has(id),
        );
        if (u) {
          refs[k] = u;
          refCount.set(r, refCount.get(r)! - 1);
          refCount.set(u, refCount.get(u)! + 1);
          swapped = true;
          break;
        }
      }
      if (!swapped) break; // no direct improvement available
    }

    refs.forEach((ref, k) => {
      out.push({
        poolIndex,
        court: court + 1,
        slot: start + k,
        round: seq[k].round,
        homeTeamId: seq[k].home,
        awayTeamId: seq[k].away,
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

// --- organizer-controlled pool structure (Slice A) -------------------------

/**
 * Suggest a default pool structure for `n` teams: maximize pools of 4, push the
 * remainder into 3s or a 5 — never a 2-team pool (except when n itself is < 3,
 * where a single small pool is unavoidable). Returns pool sizes, largest blocks
 * first. Examples: 8→[4,4], 9→[4,5], 10→[4,3,3], 11→[4,4,3], 12→[4,4,4].
 */
export function suggestPoolStructure(n: number): number[] {
  if (n <= 0) return [];
  if (n < 3) return [n]; // 1 or 2 teams: one (weak) pool, nothing to split.
  const k = Math.floor(n / 4);
  const rem = n % 4;
  if (rem === 0) return Array<number>(k).fill(4);
  if (rem === 1) return [...Array<number>(k - 1).fill(4), 5];
  if (rem === 2) return [...Array<number>(k - 1).fill(4), 3, 3];
  return [...Array<number>(k).fill(4), 3]; // rem === 3
}

export interface StructureValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an organizer's pool structure against the team count. The only hard
 * error is sizes not summing to the team count (or a non-positive pool); weak
 * pools (≤ 2 teams) are a non-blocking warning.
 */
export function validatePoolStructure(
  sizes: number[],
  teamCount: number,
): StructureValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sum = sizes.reduce((a, b) => a + b, 0);

  if (sizes.some((s) => !Number.isInteger(s) || s <= 0)) {
    errors.push("Every pool needs at least one team.");
  }
  if (sum !== teamCount) {
    errors.push(
      `Pools must use all ${teamCount} teams — they currently total ${sum}.`,
    );
  }
  const weak = sizes.filter((s) => s > 0 && s <= 2).length;
  if (weak > 0) {
    warnings.push(
      `${weak} pool${weak > 1 ? "s" : ""} of 2 or fewer teams — most teams will play very few games.`,
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Auto-fill: snake/serpentine-draft seeded teams into pools of the given sizes,
 * skipping pools that are already full. Keeps pools balanced by strength even
 * when sizes differ. Assumes sizes sum to seededTeamIds.length (validate first);
 * any overflow teams are dropped, any shortfall leaves pools partially filled.
 */
export function snakeDraftIntoSizes(
  seededTeamIds: TeamId[],
  sizes: number[],
): TeamId[][] {
  const poolCount = sizes.length;
  const pools: TeamId[][] = Array.from({ length: poolCount }, () => []);
  if (poolCount === 0) return pools;

  let idx = 0;
  let row = 0;
  while (idx < seededTeamIds.length) {
    const order =
      row % 2 === 0
        ? [...Array(poolCount).keys()]
        : [...Array(poolCount).keys()].reverse();
    let placed = false;
    for (const p of order) {
      if (idx >= seededTeamIds.length) break;
      if (pools[p].length < sizes[p]) {
        pools[p].push(seededTeamIds[idx++]);
        placed = true;
      }
    }
    if (!placed) break; // every pool full but teams remain — sizes too small
    row++;
  }
  return pools;
}

export interface PoolPlan {
  /** Round-robin repetitions: 3-team pools play a double round-robin. */
  roundsPerTeam: number;
}

/**
 * Round-robin repetitions for a pool of `size` teams: a 3-team pool plays a
 * double round-robin (so every team gets a fair number of games); all other
 * sizes play a single round-robin. Pool size no longer forces a match format —
 * the organizer's chosen pool format applies (see resolveMatchFormat); a pool
 * can still be opted into shorter games explicitly.
 */
export function poolPlan(size: number): PoolPlan {
  return { roundsPerTeam: size === 3 ? 2 : 1 };
}

/**
 * The format a match is actually played under, in precedence order:
 *   1. the pool's explicit override (a "shorter games" pool),
 *   2. the tournament's chosen pool-play format (2-set vs best-of-3),
 *   3. the competition's base format (the bracket / default).
 * Bracket matches pass `poolDefaultFormat = null` (no pool), so they fall
 * through to the competition base.
 */
export function resolveMatchFormat(
  poolMatchFormat: MatchFormat | null | undefined,
  poolDefaultFormat: MatchFormat | null | undefined,
  competitionFormat: MatchFormat,
): MatchFormat {
  return poolMatchFormat ?? poolDefaultFormat ?? competitionFormat;
}
