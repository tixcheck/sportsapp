/**
 * A ladder night entered as FINAL STANDINGS rather than scores.
 *
 * Scarborough's organizer: "for the app we don't need to input each score, just
 * the final standings at the end of the night." Their sheet has a Total Points
 * column per team, and the finishing order falls out of it — except on a tie,
 * where the gym decides and the organizer tells us. So points are recorded and
 * suggest the order, but the ORDER is what gets stored (`result_rank`), and it
 * is what moves teams. Points never override a rank the organizer set.
 *
 * Pure: no DB access.
 */

export interface TypedResult {
  teamId: string;
  /** 1 = won the gym. Null = not entered. */
  rank: number | null;
  points: number | null;
}

export type TypedTierOrder =
  /** Every team has a rank, 1…n with no gaps or repeats. */
  | { status: "complete"; rankedTeamIds: string[] }
  /** Nobody in the tier has a rank: rank it from match results instead. */
  | { status: "none" }
  /** Some ranks are in and some aren't — refuse rather than guess the rest. */
  | { status: "partial"; entered: number; of: number }
  /** Ranks that cannot be a finishing order (a repeat, a gap, a stranger). */
  | { status: "invalid"; reason: string };

/**
 * Read a tier's finishing order from its typed ranks.
 *
 * `teamIds` is who sat in the tier that week. A result for anyone else, or a
 * rank outside 1…n, means the entry and the draw disagree about who was there,
 * which is worth stopping on: moving teams on it would promote a stranger.
 */
export function typedTierOrder(
  teamIds: readonly string[],
  results: readonly TypedResult[],
): TypedTierOrder {
  const inTier = new Set(teamIds);
  const byTeam = new Map(results.map((r) => [r.teamId, r]));

  for (const r of results) {
    if (!inTier.has(r.teamId) && r.rank != null) {
      return { status: "invalid", reason: "a ranked team isn't in this tier" };
    }
  }

  const ranked = teamIds
    .map((id) => ({ id, rank: byTeam.get(id)?.rank ?? null }))
    .filter((r): r is { id: string; rank: number } => r.rank != null);

  if (ranked.length === 0) return { status: "none" };
  if (ranked.length < teamIds.length) {
    return { status: "partial", entered: ranked.length, of: teamIds.length };
  }

  const seen = new Set<number>();
  for (const r of ranked) {
    if (!Number.isInteger(r.rank) || r.rank < 1 || r.rank > teamIds.length) {
      return {
        status: "invalid",
        reason: `rank ${r.rank} is outside 1–${teamIds.length}`,
      };
    }
    if (seen.has(r.rank)) {
      return { status: "invalid", reason: `two teams are ranked ${r.rank}` };
    }
    seen.add(r.rank);
  }

  return {
    status: "complete",
    rankedTeamIds: [...ranked].sort((a, b) => a.rank - b.rank).map((r) => r.id),
  };
}

/**
 * Order a tier by points, highest first, and say where the points can't decide.
 *
 * Stable: teams on equal points keep the order they came in, so whatever order
 * the organizer already chose for a tie survives a re-sort. Teams with no points
 * yet go last, also in their incoming order.
 *
 * `ties` lists each group of two or more teams on the same points — the places
 * the organizer has to look at, because the sheet's total alone doesn't say who
 * finished ahead.
 */
export function orderByPoints(
  entries: readonly { teamId: string; points: number | null }[],
): { teamIds: string[]; ties: string[][] } {
  const indexed = entries.map((e, i) => ({ ...e, i }));
  indexed.sort((a, b) => {
    if (a.points == null && b.points == null) return a.i - b.i;
    if (a.points == null) return 1;
    if (b.points == null) return -1;
    return b.points - a.points || a.i - b.i;
  });

  const groups = new Map<number, string[]>();
  for (const e of indexed) {
    if (e.points == null) continue;
    const g = groups.get(e.points) ?? [];
    g.push(e.teamId);
    groups.set(e.points, g);
  }

  return {
    teamIds: indexed.map((e) => e.teamId),
    ties: [...groups.values()].filter((g) => g.length > 1),
  };
}
