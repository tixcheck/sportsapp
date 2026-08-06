/**
 * Ladder league — moving teams between tiers after a night. Pure: no DB access.
 *
 * The organizer sets, per tier, how many teams drop and how many rise. The
 * counts are independent: Tier 2 may send 2 down while Tier 3 sends only 1 up.
 *
 * When the counts match at a boundary, tier sizes hold forever, and tiers need
 * NOT be the same size — 5/6/5 with one team crossing each boundary stays
 * 5/6/5. When they don't match, sizes drift by design (the owner's call,
 * 2026-08-06): 2 down from Tier 2 against 1 up from Tier 3 shrinks Tier 2 by a
 * team a week. `projectTierSizes` exists so the organizer sees that at setup
 * instead of discovering it in week six.
 *
 * The only hard rule: a tier never falls below `minTeamsPerTier` (2 — fewer
 * can't play). A move that would breach it is refused for that week and
 * reported, never silently applied.
 */

export interface LadderTier {
  divisionId: string;
  /** Teams ranked best (index 0) to worst, from tonight's results. */
  rankedTeamIds: string[];
}

export interface TierMovement {
  divisionId: string;
  /** Teams dropping to the tier below. Ignored for the bottom tier. */
  down: number;
  /** Teams rising to the tier above. Ignored for the top tier. */
  up: number;
}

export interface LadderMove {
  teamId: string;
  fromDivisionId: string;
  toDivisionId: string;
  direction: "up" | "down";
}

export type BlockedReason =
  /** Top tier has nowhere up; bottom tier has nowhere down. */
  | "no-adjacent-tier"
  /** The tier doesn't have enough teams to send that many in both directions. */
  | "not-enough-teams"
  /** Sending them would drop the tier under the minimum to play. */
  | "would-breach-minimum";

export interface BlockedMovement {
  divisionId: string;
  direction: "up" | "down";
  requested: number;
  applied: number;
  reason: BlockedReason;
}

export interface LadderMovementResult {
  /** Tiers top-first, with next week's rosters. */
  tiers: { divisionId: string; teamIds: string[] }[];
  moves: LadderMove[];
  /** Anything the guards refused, for the organizer to see. */
  blocked: BlockedMovement[];
}

export interface LadderMovementOptions {
  /** Fewest teams a tier can hold and still play. Default 2. */
  minTeamsPerTier?: number;
}

/**
 * Apply one night's promotions and relegations.
 *
 * `tiers` must be ordered top-first. Movement is simultaneous: every team moves
 * based on tonight's finishing order, so a team can't be promoted into a tier
 * and then relegated back out in the same step.
 *
 * Ordering within a receiving tier reflects where the teams came from — a team
 * dropping from above enters at the top of the tier below (it was the weakest
 * of a stronger group), a team rising from below enters at the bottom. This
 * only affects display; the next night's split ignores order.
 */
export function applyLadderMovement(
  tiers: LadderTier[],
  movement: TierMovement[],
  options: LadderMovementOptions = {},
): LadderMovementResult {
  const min = options.minTeamsPerTier ?? 2;
  const blocked: BlockedMovement[] = [];
  const byDivision = new Map(movement.map((m) => [m.divisionId, m]));

  const size = tiers.map((t) => t.rankedTeamIds.length);
  const up: number[] = [];
  const down: number[] = [];

  // 1. Requested counts, with the ends pinned (nothing above the top tier,
  //    nothing below the bottom one).
  for (const [i, tier] of tiers.entries()) {
    const cfg = byDivision.get(tier.divisionId);
    const wantUp = Math.max(0, cfg?.up ?? 0);
    const wantDown = Math.max(0, cfg?.down ?? 0);

    const canGoUp = i > 0;
    const canGoDown = i < tiers.length - 1;
    if (!canGoUp && wantUp > 0) {
      blocked.push({
        divisionId: tier.divisionId,
        direction: "up",
        requested: wantUp,
        applied: 0,
        reason: "no-adjacent-tier",
      });
    }
    if (!canGoDown && wantDown > 0) {
      blocked.push({
        divisionId: tier.divisionId,
        direction: "down",
        requested: wantDown,
        applied: 0,
        reason: "no-adjacent-tier",
      });
    }
    up.push(canGoUp ? wantUp : 0);
    down.push(canGoDown ? wantDown : 0);
  }

  // 2. A tier can't send more teams than it has. Trim the drop first — being
  //    held up is kinder than being sent down on a technicality.
  for (let i = 0; i < tiers.length; i++) {
    const outgoing = up[i] + down[i];
    if (outgoing <= size[i]) continue;
    let excess = outgoing - size[i];
    const trimDown = Math.min(excess, down[i]);
    if (trimDown > 0) {
      blocked.push({
        divisionId: tiers[i].divisionId,
        direction: "down",
        requested: down[i],
        applied: down[i] - trimDown,
        reason: "not-enough-teams",
      });
      down[i] -= trimDown;
      excess -= trimDown;
    }
    if (excess > 0) {
      blocked.push({
        divisionId: tiers[i].divisionId,
        direction: "up",
        requested: up[i],
        applied: up[i] - excess,
        reason: "not-enough-teams",
      });
      up[i] -= excess;
    }
  }

  // 3. Keep every tier playable. A tier only shrinks through its OWN outgoing
  //    moves (incoming can only add), so easing those off always converges.
  for (let guard = 0; guard < 100; guard++) {
    const resulting = tiers.map((_, i) => {
      const incoming =
        (i > 0 ? down[i - 1] : 0) + (i < tiers.length - 1 ? up[i + 1] : 0);
      return size[i] - up[i] - down[i] + incoming;
    });
    const i = resulting.findIndex(
      (n, idx) => n < min && up[idx] + down[idx] > 0,
    );
    if (i === -1) break;

    // Hold back one team at a time, the drop before the promotion.
    if (down[i] > 0) {
      blocked.push({
        divisionId: tiers[i].divisionId,
        direction: "down",
        requested: down[i],
        applied: down[i] - 1,
        reason: "would-breach-minimum",
      });
      down[i] -= 1;
    } else {
      blocked.push({
        divisionId: tiers[i].divisionId,
        direction: "up",
        requested: up[i],
        applied: up[i] - 1,
        reason: "would-breach-minimum",
      });
      up[i] -= 1;
    }
  }

  // 4. Pick the movers off tonight's finishing order and rebuild the rosters.
  const promoted: string[][] = tiers.map(() => []);
  const relegated: string[][] = tiers.map(() => []);
  const stayers: string[][] = tiers.map(() => []);
  const moves: LadderMove[] = [];

  for (const [i, tier] of tiers.entries()) {
    const ranked = tier.rankedTeamIds;
    const risers = ranked.slice(0, up[i]);
    const droppers = down[i] > 0 ? ranked.slice(ranked.length - down[i]) : [];
    stayers[i] = ranked.slice(up[i], ranked.length - down[i]);
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

  const result = tiers.map((tier, i) => ({
    divisionId: tier.divisionId,
    teamIds: [
      // Dropped from the tier above — weakest of a stronger group, so on top.
      ...(i > 0 ? relegated[i - 1] : []),
      ...stayers[i],
      // Risen from below — strongest of a weaker group, so at the bottom.
      ...(i < tiers.length - 1 ? promoted[i + 1] : []),
    ],
  }));

  return { tiers: result, moves, blocked };
}

/**
 * Tier sizes week by week under a movement config — what the organizer sees
 * before committing, so a drifting setup is obvious at setup time.
 *
 * Runs the real movement engine on placeholder teams, so the projection can't
 * drift from what actually happens. Index 0 of the result is the starting size.
 */
export function projectTierSizes(
  startingSizes: number[],
  movement: TierMovement[],
  weeks: number,
  options: LadderMovementOptions = {},
): number[][] {
  let tiers: LadderTier[] = startingSizes.map((n, i) => ({
    divisionId: movement[i]?.divisionId ?? `tier-${i}`,
    rankedTeamIds: Array.from({ length: n }, (_, k) => `t${i}-${k}`),
  }));

  const out: number[][] = [tiers.map((t) => t.rankedTeamIds.length)];
  for (let w = 0; w < Math.max(0, weeks); w++) {
    const res = applyLadderMovement(tiers, movement, options);
    tiers = res.tiers.map((t) => ({
      divisionId: t.divisionId,
      rankedTeamIds: t.teamIds,
    }));
    out.push(tiers.map((t) => t.rankedTeamIds.length));
  }
  return out;
}
