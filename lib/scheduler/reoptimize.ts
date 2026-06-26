/**
 * Smart pool scheduling — slice 3, part 3: non-destructive re-optimize.
 *
 * Pure planner for "Re-optimize schedule": given the pool matches as they stand
 * (with which ones are already played), decide the new (court, slot, ref) for the
 * games that may move. Rules that keep it safe:
 *   - A played match (in progress / completed / has a score) never moves.
 *   - If NOTHING has been played yet, re-run the full smart layout (fair ordering
 *     + court packing) across all pools — courts may change.
 *   - Once any game is played, only pools that have NOT started are reordered, and
 *     each stays on its current court (no cross-court moves around live games).
 * Slots are absolute waves from a common base (slot 0 = the event's first-match
 * time), so the caller turns slot → time with one base + per-slot minutes.
 *
 * Pure + deterministic. Returns assignments only for matches that should change.
 */

import { assignPoolRefs, type LayoutPool } from "@/lib/scheduler/pools";
import { layoutPoolSchedule } from "@/lib/scheduler/pools";
import { orderPoolMatches } from "@/lib/scheduler/pool-ordering";
import type { TeamId } from "@/lib/scheduler/round-robin";

export interface ReoptInputMatch {
  id: string;
  poolId: string;
  /** e.g. "Court 2"; used to keep started/partial pools on their court. */
  court: string | null;
  /** Current 0-based wave (caller derives from scheduled_at). */
  slot: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** In progress, completed, or has a score → fixed in place. */
  played: boolean;
}

export interface ReoptAssignment {
  id: string;
  /** Court for the match, "Court N" (unchanged for the partial path). */
  court: string;
  /** New 0-based wave from the common base. */
  slot: number;
  refTeamId: TeamId | null;
}

function courtNumber(court: string | null): number {
  const n = court ? Number.parseInt(court.replace(/[^0-9]/g, ""), 10) : NaN;
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Teams in a pool, in first-seen order over its matches. */
function uniqueTeams(matches: ReoptInputMatch[]): TeamId[] {
  const seen = new Set<TeamId>();
  const ids: TeamId[] = [];
  for (const m of matches) {
    for (const t of [m.homeTeamId, m.awayTeamId]) {
      if (!seen.has(t)) {
        seen.add(t);
        ids.push(t);
      }
    }
  }
  return ids;
}

/** One synthetic pairing round holding a pool's matches in their current order. */
function asLayoutPool(matches: ReoptInputMatch[]): LayoutPool {
  const inOrder = [...matches].sort((a, b) => a.slot - b.slot);
  return {
    teamIds: uniqueTeams(inOrder),
    rounds: [
      {
        round: 0,
        pairs: inOrder.map((m) => ({
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
        })),
        byeTeamId: null,
      },
    ],
  };
}

function groupByPool(
  matches: ReoptInputMatch[],
): { poolId: string; matches: ReoptInputMatch[] }[] {
  const byPool = new Map<string, ReoptInputMatch[]>();
  for (const m of matches) {
    const list = byPool.get(m.poolId) ?? [];
    list.push(m);
    byPool.set(m.poolId, list);
  }
  return [...byPool.entries()].map(([poolId, ms]) => ({ poolId, matches: ms }));
}

/** Find an existing match in a pool by its (home, away) orientation. */
function matchByPair(
  matches: ReoptInputMatch[],
  homeTeamId: TeamId,
  awayTeamId: TeamId,
): ReoptInputMatch | undefined {
  return matches.find(
    (m) => m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId,
  );
}

/**
 * Plan the re-optimize. `courts` is only used on the fresh path (full re-pack).
 * Returns assignments for the matches that should be updated; everything else is
 * intentionally left untouched.
 */
export function planReoptimize(
  matches: ReoptInputMatch[],
  courts: number,
): ReoptAssignment[] {
  if (matches.length === 0) return [];
  const pools = groupByPool(matches);
  const anyPlayed = matches.some((m) => m.played);

  if (!anyPlayed) {
    // Fresh event: full smart re-layout (ordering + court packing). Pools are
    // ordered by their current (court, start slot) so packing's "current"
    // candidate matches reality before it tries to beat it.
    const ordered = [...pools].sort((a, b) => {
      const ca = Math.min(...a.matches.map((m) => courtNumber(m.court)));
      const cb = Math.min(...b.matches.map((m) => courtNumber(m.court)));
      const sa = Math.min(...a.matches.map((m) => m.slot));
      const sb = Math.min(...b.matches.map((m) => m.slot));
      return ca - cb || sa - sb || a.poolId.localeCompare(b.poolId);
    });
    const laid = layoutPoolSchedule(
      ordered.map((p) => asLayoutPool(p.matches)),
      courts,
    );
    const out: ReoptAssignment[] = [];
    for (const s of laid) {
      const pool = ordered[s.poolIndex];
      const m = matchByPair(pool.matches, s.homeTeamId, s.awayTeamId);
      if (m) {
        out.push({
          id: m.id,
          court: `Court ${s.court}`,
          slot: s.slot,
          refTeamId: s.refTeamId,
        });
      }
    }
    return out;
  }

  // Live event: reorder only pools that have not started; keep their court.
  const out: ReoptAssignment[] = [];
  for (const pool of pools) {
    if (pool.matches.some((m) => m.played)) continue; // started → leave it
    const inOrder = [...pool.matches].sort((a, b) => a.slot - b.slot);
    const startSlot = inOrder[0].slot;
    const court = inOrder[0].court ?? "Court 1";
    const lp = asLayoutPool(inOrder);
    const seq = orderPoolMatches(lp.teamIds, lp.rounds);
    const refs = assignPoolRefs(
      lp.teamIds,
      seq.map((s) => ({ homeTeamId: s.homeTeamId, awayTeamId: s.awayTeamId })),
    );
    seq.forEach((s, k) => {
      const m = matchByPair(inOrder, s.homeTeamId, s.awayTeamId);
      if (m) {
        out.push({
          id: m.id,
          court,
          slot: startSlot + k,
          refTeamId: refs[k],
        });
      }
    });
  }
  return out;
}
