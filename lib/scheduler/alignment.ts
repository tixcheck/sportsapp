/**
 * BVL's alignment night — the session grid. Pure: no DB, no clock.
 *
 * Every session is six teams lettered A–F by rank, playing "STANDARD SCHEDULE
 * B" from BVL's sheet: a 5-minute "explain process and warm up", then five
 * rounds of timed games on courts A, B and C. The 6-team rounds are a full
 * round robin — each team meets the other five once.
 *
 * Ranking a finished session (wins, then +/- capped at 15 a game, then seat)
 * and moving its top two up happen in the database (`alignment_advance`,
 * 0165), so they run the moment the last score lands, whoever enters it.
 * `rankSession` here is the same rule, for tests and previews.
 */

export const SCHEDULE_B: [string, string][][] = [
  [
    ["A", "F"],
    ["B", "E"],
    ["C", "D"],
  ],
  [
    ["A", "E"],
    ["B", "D"],
    ["C", "F"],
  ],
  [
    ["A", "D"],
    ["B", "C"],
    ["E", "F"],
  ],
  [
    ["A", "C"],
    ["B", "F"],
    ["D", "E"],
  ],
  [
    ["A", "B"],
    ["D", "F"],
    ["C", "E"],
  ],
];

export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/** Alignment games end on the clock: one set, any score, a level game allowed. */
export const TIMED_GAME_FORMAT = {
  bestOf: 1 as const,
  setsToPoints: [25],
  winBy: 1,
  untargeted: true,
  allowTie: true,
};

export interface AlignmentFixture {
  home: string;
  away: string;
  court: string;
  round: number;
  /** Minutes after the session's start. */
  offsetMinutes: number;
}

/**
 * A session's games: Schedule B, courts a/b/c, each round `gameMinutes`
 * apart after the warm-up. BVL's sheets give 13–15 minute games; NS's says 14.
 */
export function sessionFixtures(
  opts: {
    gameMinutes?: number;
    warmupMinutes?: number;
    courts?: string[];
  } = {},
): AlignmentFixture[] {
  const game = opts.gameMinutes ?? 14;
  const warm = opts.warmupMinutes ?? 5;
  const courts = opts.courts ?? ["a", "b", "c"];
  return SCHEDULE_B.flatMap((round, r) =>
    round.map(([home, away], c) => ({
      home,
      away,
      court: courts[c],
      round: r + 1,
      offsetMinutes: warm + r * game,
    })),
  );
}

export interface SessionGame {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

/**
 * A session's finishing order: wins, then +/- with each game's margin capped
 * at 15 ("Maximum recorded difference margin is 15 POINTS"), then seat. A
 * level game is no win for either side. Same rule as `alignment_advance`.
 */
export function rankSession(seats: string[], games: SessionGame[]): string[] {
  const wins = new Map(seats.map((s) => [s, 0]));
  const pm = new Map(seats.map((s) => [s, 0]));
  for (const g of games) {
    const d = Math.max(-15, Math.min(15, g.homeScore - g.awayScore));
    if (d > 0) wins.set(g.home, (wins.get(g.home) ?? 0) + 1);
    if (d < 0) wins.set(g.away, (wins.get(g.away) ?? 0) + 1);
    pm.set(g.home, (pm.get(g.home) ?? 0) + d);
    pm.set(g.away, (pm.get(g.away) ?? 0) - d);
  }
  return [...seats].sort(
    (a, b) =>
      (wins.get(b) ?? 0) - (wins.get(a) ?? 0) ||
      (pm.get(b) ?? 0) - (pm.get(a) ?? 0) ||
      seats.indexOf(a) - seats.indexOf(b),
  );
}

/**
 * Seat the night's ranking into tiers, top down: `sizes` [4, 6, 6, 6, 4] puts
 * ranks 1–4 in the first tier, 5–10 in the second, and so on. Each team's
 * seed is its overall rank. The sizes must add up to the teams ranked.
 */
export function seatTiers(
  ranked: string[],
  sizes: number[],
): { error: string } | { tiers: string[][]; seeds: Map<string, number> } {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (sizes.some((n) => !Number.isInteger(n) || n < 2)) {
    return { error: "Every tier needs at least two teams." };
  }
  if (total !== ranked.length) {
    return {
      error: `The tiers hold ${total} teams, but ${ranked.length} were ranked.`,
    };
  }
  const tiers: string[][] = [];
  let at = 0;
  for (const n of sizes) {
    tiers.push(ranked.slice(at, at + n));
    at += n;
  }
  return { tiers, seeds: new Map(ranked.map((id, i) => [id, i + 1])) };
}

/**
 * A starting point for the tier-size box, not a rule — the organizer edits it.
 * Tiers of six; what doesn't divide goes to 4-team tiers at the top and
 * bottom (BVL Non-Spiking's 26 → 4, 6, 6, 6, 4).
 */
export function suggestTierSizes(teams: number): number[] {
  if (teams < 4) return [teams];
  for (const ends of [[], [4], [4, 4]] as number[][]) {
    const middle = teams - ends.reduce((a, b) => a + b, 0);
    if (middle >= 0 && middle % 6 === 0) {
      const sixes = Array(middle / 6).fill(6);
      return ends.length === 2 ? [4, ...sixes, 4] : [...sixes, ...ends];
    }
  }
  const sixes = Array(Math.floor(teams / 6)).fill(6);
  const rest = teams % 6;
  return rest >= 2 ? [...sixes, rest] : [...sixes.slice(1), 6 + rest];
}
