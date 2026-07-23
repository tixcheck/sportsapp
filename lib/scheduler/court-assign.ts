/**
 * Assign each round-robin match a court from a league's custom court list, with
 * fair "prime court" balancing (PRD §7, custom courts). Pure: no DB.
 *
 * A league plays on a specific set of courts (e.g. 9, 10, 11, 12, 14–18), some
 * flagged "prime" (better conditions — closer, sheltered, nicer). Prime courts
 * are a scarce good, so each round they go to the matches whose teams have had
 * the FEWEST prime games so far. Over the season every team ends up with a
 * roughly equal share of prime-court games, and no team is stuck on the far
 * court all year.
 */

import type { PairingRound, TeamId } from "./round-robin";

export interface Court {
  /** Display label, e.g. "9" or "Court A". */
  label: string;
  /** Better-conditions court — balanced fairly across teams. */
  prime: boolean;
}

export interface RoundCourts {
  round: number;
  /** Court label per pair, index-aligned with the round's `pairs`. */
  courts: string[];
}

/** Rotate an array left by `by` (stable court choice that still varies by round). */
function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr;
  const k = ((by % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

/**
 * Court labels for each match, one per pair. Assumes the league has at least as
 * many courts as the busiest round has matches (the app enforces this); if not,
 * courts are reused (a warning the caller should surface). With no prime courts
 * it's a plain even rotation; the return preserves each round's pair order.
 */
export function assignCourts(
  pairings: PairingRound[],
  courts: Court[],
  /**
   * Prime games already played, per team — seeds the fairness ledger so a
   * mid-season continuation keeps balancing against week 1 rather than starting
   * fresh. Omit for a full-season generation (everyone starts at zero).
   */
  initialPrimeGames?: ReadonlyMap<TeamId, number>,
): RoundCourts[] {
  if (courts.length === 0) {
    return pairings.map((r) => ({
      round: r.round,
      courts: r.pairs.map(() => "1"),
    }));
  }

  const primeLabelsAll = courts.filter((c) => c.prime).map((c) => c.label);
  const nonPrimeLabelsAll = courts.filter((c) => !c.prime).map((c) => c.label);

  // Prime games played so far, per team — the fairness ledger.
  const primeGames = new Map<TeamId, number>(initialPrimeGames ?? []);
  const primeOf = (id: TeamId) => primeGames.get(id) ?? 0;

  return pairings.map((r, roundIdx) => {
    const m = r.pairs.length;
    const primeThisRound = Math.min(primeLabelsAll.length, m);
    const primeLabels = rotate(primeLabelsAll, roundIdx);
    const nonPrimeLabels = rotate(nonPrimeLabelsAll, roundIdx);

    // Rank matches by how few prime games their teams have had (ties → order).
    const order = r.pairs
      .map((p, i) => ({
        i,
        need: primeOf(p.homeTeamId) + primeOf(p.awayTeamId),
      }))
      .sort((a, b) => a.need - b.need || a.i - b.i);

    const courtByPair: string[] = new Array(m);
    let pj = 0;
    let nj = 0;
    order.forEach(({ i }, rank) => {
      if (rank < primeThisRound) {
        courtByPair[i] = primeLabels[pj++ % primeLabels.length];
        primeGames.set(
          r.pairs[i].homeTeamId,
          primeOf(r.pairs[i].homeTeamId) + 1,
        );
        primeGames.set(
          r.pairs[i].awayTeamId,
          primeOf(r.pairs[i].awayTeamId) + 1,
        );
      } else if (nonPrimeLabels.length > 0) {
        courtByPair[i] = nonPrimeLabels[nj++ % nonPrimeLabels.length];
      } else {
        // All courts are prime but more matches than courts — reuse (over-capacity).
        courtByPair[i] = primeLabels[pj++ % primeLabels.length];
      }
    });

    return { round: r.round, courts: courtByPair };
  });
}
