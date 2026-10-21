import { DateTime } from "luxon";

/** The element id of a game on the scorekeeper page; the return link aims at it. */
export const gameAnchor = (matchId: string) => `game-${matchId}`;

/**
 * Where a scorekeeper lands after a game: that night's list, scrolled to the
 * game they just left. Vincent (BVL, 2026-10-20): with fifteen games a night
 * the list reopened at the top every time, and he scrolled back down to find
 * his place after each score.
 *
 * The day is pinned too, so finishing a game from an earlier night returns to
 * that night rather than whichever one the page would open on.
 */
export function scorekeeperReturnUrl(
  competitionId: string,
  match: { id: string; scheduledAt: string | null },
  timezone: string,
): string {
  const day = match.scheduledAt
    ? DateTime.fromISO(match.scheduledAt, { zone: "utc" })
        .setZone(timezone)
        .toFormat("yyyy-MM-dd")
    : null;
  const query = day ? `?day=${day}` : "";
  return `/score/${competitionId}${query}#${gameAnchor(match.id)}`;
}
