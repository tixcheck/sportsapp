/**
 * What each kind of scorer may do with a game's score (0168).
 *
 * - admin: the league's organizers. Final, can edit a final score, can record
 *   an abnormal result.
 * - scorekeeper: an onsite with scores-only access. Their entry is final and
 *   they can correct a final score — that's the job — but no abnormal
 *   override, and nothing outside scores (the database enforces that).
 * - player: a captain/teammate/ref where the league allows. May need the
 *   other side to confirm; a final score is the organizer's to change.
 */
export type ScorerRole = "admin" | "scorekeeper" | "player";

export function scorerRole(
  isAdmin: boolean,
  isScorekeeper: boolean,
): ScorerRole {
  return isAdmin ? "admin" : isScorekeeper ? "scorekeeper" : "player";
}

/** May this scorer change a score that's already final? */
export function canEditFinal(role: ScorerRole): boolean {
  return role !== "player";
}

/** Does this entry wait for the other captain? */
export function needsConfirmation(
  role: ScorerRole,
  leagueRequiresConfirmation: boolean,
): boolean {
  return leagueRequiresConfirmation && role === "player";
}

/** Show the entry form (vs the read-only score). */
export function showEntryForm(
  role: ScorerRole,
  o: { canEnter: boolean; final: boolean; awaitingMyConfirmation: boolean },
): boolean {
  if (!o.canEnter) return false;
  if (canEditFinal(role)) return true;
  return !o.final && !o.awaitingMyConfirmation;
}
