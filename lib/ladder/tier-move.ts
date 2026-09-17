/**
 * Whether an organizer may move a team into a different tier by hand.
 *
 * Mango's organizer mis-assigned teams to tiers before week 1 and had no way to
 * correct it: a league team's `division_id` is written when the team is created
 * and never again. Nothing in nine league actions updates it.
 *
 * The rule is "before the season only", and the reason is that tier membership
 * changes hands once play starts. With no placements, `drawLadderWeekAction`
 * reads `teams.division_id` and writes week 1's `ladder_placements` FROM it.
 * From then on the draw reads the placements and ignores `division_id`
 * entirely — so a hand-move after that would look like it worked and change
 * nothing about who actually plays whom. Refusing is the honest answer, and
 * promotion/relegation is what moves teams from then on.
 *
 * Pure: no DB.
 */

export interface TierMoveFacts {
  /** Any ladder_placements row exists for this competition — the season has started. */
  hasPlacements: boolean;
  /** The team's current tier, or null when it was never sorted into one. */
  fromDivisionId: string | null;
  /** The tier it is being moved to. Null = un-sort it. */
  toDivisionId: string | null;
  /** The target tier belongs to this same competition. */
  targetInCompetition: boolean;
  /** Withdrawn teams are not in the running and must not be re-tiered. */
  withdrawn: boolean;
}

export type TierMoveCheck =
  | { ok: true }
  /** `noop` is a success the caller should skip, not an error to show. */
  | { ok: false; noop: true }
  | { ok: false; noop?: false; reason: string };

export function canMoveTier(f: TierMoveFacts): TierMoveCheck {
  if (f.toDivisionId === f.fromDivisionId) return { ok: false, noop: true };

  if (f.hasPlacements) {
    return {
      ok: false,
      reason:
        "The season has started — teams move between tiers on their results now. Undo the latest week if you need to change a tier by hand.",
    };
  }
  if (f.withdrawn) {
    return { ok: false, reason: "That team has withdrawn." };
  }
  // A tier id from another competition would move the team out of this league
  // without removing it — it would vanish from every tier here and appear in
  // someone else's standings.
  if (f.toDivisionId !== null && !f.targetInCompetition) {
    return { ok: false, reason: "That tier isn't part of this league." };
  }
  return { ok: true };
}
