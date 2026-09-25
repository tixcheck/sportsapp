/**
 * Whether a player can actually reach the league they are listed in.
 *
 * Two different questions, and conflating them hides the case that matters:
 *
 *   JOINED THE PLATFORM — do they have an account at all. A drafted player
 *   usually does not; `place_free_agents` only writes a `team_members` row for
 *   somebody who already had one.
 *
 *   CAN SEE THE LEAGUE — will it appear when they sign in. That is answered by
 *   `my_competitions`, which is built entirely on `team_members`, and by
 *   `my_pool_signups` (migration 0132), which covers people still waiting to be
 *   drafted. Somebody who is PLACED but has no roster row falls between the two
 *   and sees nothing at all.
 *
 * That last case is not hypothetical: Big Shoots has a player placed on a team,
 * with an account, and no roster row — he signs in and the league is simply not
 * there. It is the residue of the bug migration 0131 fixed, and an organizer
 * can only act on it if the Players tab says so.
 *
 * Pure: no DB.
 */

export type PlayerAccess =
  /** No account yet — nothing to sign in with. */
  | "no-account"
  /** Has an account and the league will appear for them. */
  | "can-see"
  /** Has an account, but nothing links them to the league. Needs fixing. */
  | "no-access";

export function leagueAccess(player: {
  userId: string | null;
  /** A `team_members` row exists for them in this competition. */
  hasRosterRow: boolean;
  freeAgentId: string | null;
  freeAgentStatus: string | null;
}): PlayerAccess {
  if (!player.userId) return "no-account";
  // A roster row is what `my_competitions` reads, so this is the normal path.
  if (player.hasRosterRow) return "can-see";
  // Still in the pool: `my_pool_signups` surfaces it as "Waiting to be placed".
  if (
    player.freeAgentId &&
    (player.freeAgentStatus === "available" ||
      player.freeAgentStatus === "pending_payment")
  ) {
    return "can-see";
  }
  // Placed, with an account, and no roster row — invisible to themselves.
  return "no-access";
}
