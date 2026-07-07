/**
 * Re-seeding single-elimination bracket (pure, no DB). Unlike a fixed tree, each
 * round re-ranks the surviving teams by their entering playoff seed and pairs the
 * highest seed with the lowest — rewarding the top team with the weakest available
 * opponent every round (NFL-style reseed).
 *
 * The bracket is built round-by-round: only round 1 exists at generation; each
 * later round's pairings are computed once the previous round finishes (which is
 * why they can't be known up front). The caller persists the entrant seed order
 * (index 0 = seed 1) and re-derives survivors as entrants minus losers.
 */

import { nextPowerOfTwo, type TeamId } from "./bracket";

export interface ReseedPair {
  homeTeamId: TeamId;
  awayTeamId: TeamId;
}

/**
 * Pair a seed-ordered list highest-vs-lowest: 1v last, 2v second-last, … The list
 * MUST be in seed order (best first) and have an even length.
 */
export function pairHighLow(seededTeamIds: TeamId[]): ReseedPair[] {
  const pairs: ReseedPair[] = [];
  for (let i = 0; i < seededTeamIds.length / 2; i++) {
    pairs.push({
      homeTeamId: seededTeamIds[i], // higher seed hosts
      awayTeamId: seededTeamIds[seededTeamIds.length - 1 - i],
    });
  }
  return pairs;
}

/** Byes given to the top seeds so that survivors after round 1 are a power of 2. */
export function reseedByeCount(teamCount: number): number {
  return nextPowerOfTwo(teamCount) - teamCount;
}

/**
 * Round 1: the top `byeCount` seeds sit out (they advance untouched); the rest
 * play, paired highest-vs-lowest. `seededTeamIds` is the full entrant list in
 * seed order. Returns the round-1 matches and the bye teams (for reference).
 */
export function reseedFirstRound(seededTeamIds: TeamId[]): {
  byes: TeamId[];
  matches: ReseedPair[];
} {
  const byeCount = reseedByeCount(seededTeamIds.length);
  const byes = seededTeamIds.slice(0, byeCount);
  const playing = seededTeamIds.slice(byeCount);
  return { byes, matches: pairHighLow(playing) };
}

/**
 * A later round's pairings: re-rank the survivors by their entering seed (their
 * index in the entrant order), then pair highest-vs-lowest. `survivors` is the set
 * of team ids still in; `seedIndex` maps a team to its seed rank (0 = seed 1).
 */
export function reseedNextRound(
  survivors: TeamId[],
  seedIndex: Map<TeamId, number>,
): ReseedPair[] {
  const ordered = [...survivors].sort(
    (a, b) => (seedIndex.get(a) ?? 0) - (seedIndex.get(b) ?? 0),
  );
  return pairHighLow(ordered);
}
