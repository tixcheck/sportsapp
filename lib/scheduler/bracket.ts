/**
 * Single-elimination bracket seeding (PRD §7). Pure: no DB access.
 * Bracket is sized to the next power of two; standard seeding pairs strong vs
 * weak (1v16, 8v9, 4v13, …) so every first-round pair of seeds sums to size+1;
 * when there are fewer teams than slots, the highest seeds receive byes.
 */

export type TeamId = string;

export interface BracketEntry {
  /** Seed (1 = top). null = a bye slot or a not-yet-decided slot. */
  seed: number | null;
  teamId: TeamId | null;
}

export interface BracketMatch {
  round: number;
  matchNumber: number;
  home: BracketEntry;
  away: BracketEntry;
  /** True when one side is a bye (the real team advances). */
  isBye: boolean;
}

export interface BracketResult {
  teamCount: number;
  size: number;
  /** rounds[0] is the first round; later rounds are TBD placeholders. */
  rounds: BracketMatch[][];
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket seeding order: the seed occupying each slot, such that
 * pairing slot 2k with slot 2k+1 gives the canonical matchups (1v16, 8v9, …).
 */
export function seedOrder(size: number): number[] {
  let seeds = [1];
  while (seeds.length < size) {
    const rounds = seeds.length * 2;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s, rounds + 1 - s);
    }
    seeds = next;
  }
  return seeds;
}

export function generateBracket(seededTeamIds: TeamId[]): BracketResult {
  const teamCount = seededTeamIds.length;
  const size = nextPowerOfTwo(teamCount);
  if (size < 2) return { teamCount, size, rounds: [] };

  const order = seedOrder(size);
  const entryForSeed = (seed: number): BracketEntry => ({
    seed: seed <= teamCount ? seed : null,
    teamId: seed <= teamCount ? seededTeamIds[seed - 1] : null,
  });

  const round1: BracketMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const home = entryForSeed(order[2 * i]);
    const away = entryForSeed(order[2 * i + 1]);
    round1.push({
      round: 1,
      matchNumber: i + 1,
      home,
      away,
      isBye: home.teamId === null || away.teamId === null,
    });
  }

  const rounds: BracketMatch[][] = [round1];
  let prevCount = size / 2;
  let roundNo = 2;
  while (prevCount > 1) {
    const count = prevCount / 2;
    const matches: BracketMatch[] = [];
    for (let i = 0; i < count; i++) {
      matches.push({
        round: roundNo,
        matchNumber: i + 1,
        home: { seed: null, teamId: null },
        away: { seed: null, teamId: null },
        isBye: false,
      });
    }
    rounds.push(matches);
    prevCount = count;
    roundNo += 1;
  }

  return { teamCount, size, rounds };
}
