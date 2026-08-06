/**
 * Ladder league — moving teams between tiers after a night. Pure: no DB access.
 *
 * Movement is a **swap at each boundary**: if `n` teams go up from Tier 2 to
 * Tier 1, then `n` teams come down from Tier 1 to Tier 2. Same in the other
 * direction. So the config is one count *per boundary*, not per direction —
 * an unbalanced exchange can't be expressed, which is why tier sizes are
 * provably constant all season.
 *
 * A tier's own up and down counts may still differ, and tiers need not be the
 * same size. The owner's example — Tier 1: 5, Tier 2: 6, Tier 3: 5, with one
 * team crossing the 1↔2 boundary and two crossing the 2↔3 boundary — is:
 *
 *     swaps = [1, 2]
 *     Tier 1  sends 1 down,           receives 1 up      → 5
 *     Tier 2  sends 1 up + 2 down,    receives 1 + 2     → 6
 *     Tier 3  sends 2 up,             receives 2 down    → 5
 *
 * The one thing that can force a change is a tier too small to supply its
 * boundaries (3 teams asked to send 2 up and 2 down). Because the exchange is
 * atomic, the fix has to apply to BOTH sides of that boundary — trimming only
 * the short side would reintroduce the drift this model exists to prevent.
 */

export interface LadderTier {
  divisionId: string;
  /** Teams ranked best (index 0) to worst, from tonight's results. */
  rankedTeamIds: string[];
}

export interface LadderMovementConfig {
  /**
   * Teams exchanged at each boundary, top-down: `swaps[i]` is the number
   * traded between tier `i` and tier `i + 1`. Length is `tiers.length - 1`.
   */
  swaps: number[];
}

export interface LadderMove {
  teamId: string;
  fromDivisionId: string;
  toDivisionId: string;
  direction: "up" | "down";
}

export interface AdjustedBoundary {
  /** Boundary index: between tier `boundary` and tier `boundary + 1`. */
  boundary: number;
  requested: number;
  applied: number;
  /** The tier that couldn't supply its side of the exchange. */
  limitedByDivisionId: string;
}

export interface LadderMovementResult {
  /** Tiers top-first, with next week's rosters. Sizes always match the input. */
  tiers: { divisionId: string; teamIds: string[] }[];
  moves: LadderMove[];
  /** Boundaries trimmed because a tier couldn't field that many movers. */
  adjusted: AdjustedBoundary[];
}

/**
 * Trim boundary counts until every tier can actually supply its exchanges.
 *
 * A tier commits `swaps[i-1]` teams upward and `swaps[i]` downward; the sum
 * can't exceed its roster. When it does, the bigger of the two boundaries gives
 * way first (ties go to the lower boundary, so the drop yields before the
 * promotion). Reducing a boundary relieves both tiers touching it, so this
 * always converges.
 */
export function resolveSwaps(
  sizes: number[],
  requested: number[],
): { swaps: number[]; adjusted: { boundary: number; limitedBy: number }[] } {
  const swaps = requested.map((n) => Math.max(0, Math.floor(n)));
  const adjusted: { boundary: number; limitedBy: number }[] = [];

  for (let guard = 0; guard < 1000; guard++) {
    const over = sizes.findIndex((size, i) => {
      const up = i > 0 ? swaps[i - 1] : 0;
      const down = i < swaps.length ? swaps[i] : 0;
      return up + down > size;
    });
    if (over === -1) break;

    const upIdx = over - 1;
    const downIdx = over;
    const up = upIdx >= 0 ? swaps[upIdx] : -1;
    const down = downIdx < swaps.length ? swaps[downIdx] : -1;

    // Give way at the busier boundary; on a tie the drop yields first.
    const target = down >= up ? downIdx : upIdx;
    if (target < 0 || target >= swaps.length || swaps[target] <= 0) break;
    swaps[target] -= 1;
    adjusted.push({ boundary: target, limitedBy: over });
  }

  return { swaps, adjusted };
}

/**
 * Apply one night's promotions and relegations.
 *
 * `tiers` must be ordered top-first. Movement is simultaneous — every team
 * moves on tonight's finishing order, so nobody is promoted into a tier and
 * then relegated back out in the same step.
 *
 * Seating in the receiving tier reflects where a team came from: one dropping
 * from above enters at the top (weakest of a stronger group), one rising from
 * below enters at the bottom. Display only — the next night's split ignores
 * order.
 */
export function applyLadderMovement(
  tiers: LadderTier[],
  config: LadderMovementConfig,
): LadderMovementResult {
  const sizes = tiers.map((t) => t.rankedTeamIds.length);
  const boundaries = Math.max(0, tiers.length - 1);
  const requested = Array.from(
    { length: boundaries },
    (_, i) => config.swaps[i] ?? 0,
  );

  const { swaps, adjusted } = resolveSwaps(sizes, requested);

  const promoted: string[][] = tiers.map(() => []);
  const relegated: string[][] = tiers.map(() => []);
  const stayers: string[][] = tiers.map(() => []);
  const moves: LadderMove[] = [];

  for (const [i, tier] of tiers.entries()) {
    const ranked = tier.rankedTeamIds;
    const up = i > 0 ? swaps[i - 1] : 0;
    const down = i < swaps.length ? swaps[i] : 0;

    const risers = ranked.slice(0, up);
    const droppers = down > 0 ? ranked.slice(ranked.length - down) : [];
    stayers[i] = ranked.slice(up, ranked.length - down);
    promoted[i] = risers;
    relegated[i] = droppers;

    for (const teamId of risers) {
      moves.push({
        teamId,
        fromDivisionId: tier.divisionId,
        toDivisionId: tiers[i - 1].divisionId,
        direction: "up",
      });
    }
    for (const teamId of droppers) {
      moves.push({
        teamId,
        fromDivisionId: tier.divisionId,
        toDivisionId: tiers[i + 1].divisionId,
        direction: "down",
      });
    }
  }

  return {
    tiers: tiers.map((tier, i) => ({
      divisionId: tier.divisionId,
      teamIds: [
        ...(i > 0 ? relegated[i - 1] : []),
        ...stayers[i],
        ...(i < tiers.length - 1 ? promoted[i + 1] : []),
      ],
    })),
    moves,
    adjusted: adjusted.map((a) => ({
      boundary: a.boundary,
      requested: requested[a.boundary],
      applied: swaps[a.boundary],
      limitedByDivisionId: tiers[a.limitedBy].divisionId,
    })),
  };
}

/**
 * Whether a config is playable as configured, for validation at setup time.
 * `feasible` is false when a tier can't supply its boundaries and the counts
 * had to be trimmed — the organizer should see that before the season starts,
 * not on the night.
 */
export function checkLadderConfig(
  sizes: number[],
  swaps: number[],
  minTeamsPerTier = 2,
): {
  feasible: boolean;
  resolvedSwaps: number[];
  tooSmall: number[];
} {
  const { swaps: resolved, adjusted } = resolveSwaps(sizes, swaps);
  return {
    feasible: adjusted.length === 0,
    resolvedSwaps: resolved,
    // Tier sizes never change, so a tier below the minimum is a setup problem.
    tooSmall: sizes
      .map((n, i) => (n < minTeamsPerTier ? i : -1))
      .filter((i) => i >= 0),
  };
}
