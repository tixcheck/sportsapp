/**
 * King of the Court — pure ranking / tiebreaker (no DB, no UI).
 *
 * The KotC tiebreaker hierarchy for ordering pairs (within a round or a pool):
 *   1. Total King-side points (desc)
 *   2. Longest King-side streak (desc) — longest unbroken run as King
 *   3. Reached-first: equal points AND equal longest streak → the pair that
 *      reached that final total earlier ranks higher (smaller event seq)
 *   4. Unresolved → TBD (organizer decides)
 *
 * Levels 2–3 need data a running counter can't provide (the sequence of
 * King-side outcomes, and the timing of each point), which is why the live
 * engine records a per-rally event log and distills it into `reachedSeq` /
 * `longestStreak`. With manual entry those are null and ranking falls through
 * to TBD after level 1 — the same function serves both paths.
 */

export type TeamId = string;

export interface KotcPoolResult {
  teamId: TeamId;
  /** King-side points (per-round when ranking a round; cumulative for a pool). */
  kingPoints: number;
  /** Longest unbroken King-side streak; null when unknown (manual entry). */
  longestStreak: number | null;
  /** Event seq when the pair last scored (reached its final total); null if unknown. */
  reachedSeq: number | null;
}

export type KotcTiebreakStep = 1 | 2 | 3 | 4;

export interface KotcStandingRow extends KotcPoolResult {
  /** 1-based finishing position (a total order; ties resolve to TBD but stay ordered). */
  position: number;
  /** Which level distinguished this row from the one ranked just above it. */
  tiebreakStep: KotcTiebreakStep;
  explanation: string;
}

/**
 * Compare two results by the KotC hierarchy. Returns the sort delta (negative →
 * `a` ranks higher) and the level that decided it. A level is only consulted
 * when both sides have the data for it; otherwise it's skipped.
 */
export function compareKotcResults(
  a: KotcPoolResult,
  b: KotcPoolResult,
): { cmp: number; step: KotcTiebreakStep } {
  if (a.kingPoints !== b.kingPoints) {
    return { cmp: b.kingPoints - a.kingPoints, step: 1 };
  }
  if (
    a.longestStreak != null &&
    b.longestStreak != null &&
    a.longestStreak !== b.longestStreak
  ) {
    return { cmp: b.longestStreak - a.longestStreak, step: 2 };
  }
  if (
    a.reachedSeq != null &&
    b.reachedSeq != null &&
    a.reachedSeq !== b.reachedSeq
  ) {
    // Earlier (smaller seq) ranks higher.
    return { cmp: a.reachedSeq - b.reachedSeq, step: 3 };
  }
  return { cmp: 0, step: 4 };
}

function explain(step: KotcTiebreakStep, row: KotcPoolResult): string {
  switch (step) {
    case 1:
      return `${row.kingPoints} King points`;
    case 2:
      return `Tied on points; longer streak (${row.longestStreak})`;
    case 3:
      return "Tied on points & streak; reached the total first";
    case 4:
      return "Tied — order undecided (TBD)";
  }
}

/**
 * Rank a set of pair results into a total order (positions 1..n). Deterministic:
 * truly-tied pairs (step 4) keep input order and are flagged TBD, so callers
 * that need a definite lineup (the round-end re-seed) get one, while the UI can
 * still show which ranks are unresolved.
 */
export function rankKotcPool(results: KotcPoolResult[]): KotcStandingRow[] {
  // Stable sort: index as the final, deterministic tiebreak for true ties.
  const ordered = results
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const { cmp } = compareKotcResults(x.r, y.r);
      return cmp !== 0 ? cmp : x.i - y.i;
    })
    .map((x) => x.r);

  return ordered.map((r, idx) => {
    // The step that separates this row from the one above (row 0 vs the one
    // below, so a lone leader still gets a meaningful label).
    const neighbor = idx > 0 ? ordered[idx - 1] : ordered[1];
    const step = neighbor ? compareKotcResults(r, neighbor).step : 1;
    return {
      ...r,
      position: idx + 1,
      tiebreakStep: step,
      explanation: explain(step, r),
    };
  });
}
