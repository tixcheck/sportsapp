/**
 * Why a player-stats table has nothing in it.
 *
 * "Player stats appear once scores are recorded" was shown for every empty
 * table, and in an appearance league it is frequently a lie. Big Shoots had a
 * score on week 1 and lineups on week 2, so the one thing the organizer was
 * being told to go and do was the one thing they had already done.
 *
 * A stat needs a set that was PLAYED and a record of WHO was on court for it,
 * so an appearance league has two ways to come up empty and they need different
 * sentences. Same family as the team entry gate: an empty state that names the
 * wrong cause sends somebody off to fix the wrong thing.
 *
 * Pure: given the counts, it returns the sentence.
 */

export type StatsReadiness = {
  /** Whether the league credits sets by who turned out, not by team. */
  tracksAppearances: boolean;
  /** Matches with at least one set recorded. */
  scoredMatches: number;
  /** Matches with at least one lineup recorded. */
  lineupMatches: number;
  /** Matches with BOTH — the only ones a stat can come from. */
  bothMatches: number;
};

export function statsEmptyReason(r: StatsReadiness): string {
  if (!r.tracksAppearances) {
    // Team-wide stats need only a score, so the original sentence is right.
    return "Player stats appear once scores are recorded.";
  }

  if (r.scoredMatches === 0 && r.lineupMatches === 0) {
    return "Player stats appear once you record a score and who played.";
  }

  if (r.scoredMatches === 0) {
    return "Lineups are in. Player stats appear once those games have scores.";
  }

  if (r.lineupMatches === 0) {
    return "Scores are in. Player stats appear once you record who played.";
  }

  // The trap worth naming: both exist, but never on the same match.
  if (r.bothMatches === 0) {
    return "Scores and lineups are in, but not on the same games yet — a game needs both before it counts towards anyone.";
  }

  // Both present on the same match and still nothing: whoever was recorded
  // played no scored sets. Rare, and not worth a guess beyond the facts.
  return "No player has a scored set recorded against them yet.";
}
