/**
 * A two-night league playoff where everybody plays twice on the first night.
 * Pure: no DB access.
 *
 * The shape Helix runs for Top Gun, and the reason it does not fit an ordinary
 * bracket: a knockout sends half the field home after one game, and half a
 * field driving to a gym for a single game is how you lose them. So the losers
 * of the quarter-finals play each other in the same wave the winners do, and
 * the teams outside the top eight play a short consolation of their own.
 *
 *   Night 1, wave 1   1v8  4v5  2v7  3v6          + 3 consolation games
 *   Night 1, wave 2   the four QF winners pair     + the four QF losers pair
 *                     off; so do the four losers   + 3 consolation games
 *   Night 2           final, and a bronze game     (nobody else plays)
 *
 * Fourteen games on night one, which is exactly seven courts twice over — the
 * same shape as a regular night, so the venue booking does not change.
 *
 * The championship half IS an ordinary bracket and is expressed as one, so it
 * reuses the seeding, advancement and display that already exist. Everything
 * else is a `placement` game: played for position, with no tree above it.
 */

/** Where a game's teams come from. Seeds are known now; the rest are not. */
export type TeamSource =
  | { kind: "seed"; seed: number }
  | { kind: "winner"; round: number; position: number }
  | { kind: "loser"; round: number; position: number };

export type PlayoffTrack = "championship" | "placement";

export interface PlayoffGame {
  track: PlayoffTrack;
  /** Round within the track. Identity is (track, round, position). */
  round: number;
  position: number;
  /** 1-based playing night. */
  night: number;
  /** 0-based wave within the night — games in a wave run at once. */
  wave: number;
  home: TeamSource;
  away: TeamSource;
  /** What to call it on a schedule: "Quarter-final", "Final", "5th–8th"… */
  label: string;
}

export interface LeaguePlayoffInput {
  /** Team ids in seed order, best first. The first `topCount` make the bracket. */
  seeds: string[];
  /**
   * How many teams play the championship bracket. Must be a power of two, so
   * the tree has no byes — a bye would give one team a single game on a night
   * built around everyone getting two.
   */
  topCount: number;
}

export interface LeaguePlayoffPlan {
  games: PlayoffGame[];
  /** Team ids in the championship, seed order. */
  top: string[];
  /** Team ids in the consolation, seed order. */
  bottom: string[];
  /**
   * Games every team is guaranteed on night one — the promise the format
   * makes. Bracket teams that keep winning play more; nobody plays fewer.
   */
  guaranteedGames: number;
}

/**
 * Why a field can't run this playoff, or null if it can.
 *
 * Returned rather than thrown so a panel can explain itself while the organizer
 * is still choosing; `planLeaguePlayoff` throws on the same conditions.
 */
export function leaguePlayoffProblem(
  teamCount: number,
  topCount: number,
): string | null {
  if (!Number.isInteger(topCount) || topCount < 8) {
    // Below eight, the beaten first-round teams ARE the bronze game, so a
    // separate losers' game would be the same fixture twice.
    return "At least 8 teams have to make the bracket for this format.";
  }
  if ((topCount & (topCount - 1)) !== 0) {
    return `${topCount} doesn't make a clean bracket — use 4, 8 or 16 so nobody gets a bye.`;
  }
  if (teamCount < topCount) {
    return `Only ${teamCount} teams — not enough for a top ${topCount}.`;
  }
  const bottom = teamCount - topCount;
  if (bottom === 1) {
    return "That leaves one team outside the bracket with nobody to play.";
  }
  if (bottom % 2 === 1) {
    return `That leaves ${bottom} teams outside the bracket, and an odd number can't be paired into games.`;
  }
  return null;
}

/**
 * Standard bracket seeding: the order in which seeds are laid down the first
 * round so the top two can only meet in the final. For eight: 1,8,4,5,2,7,3,6.
 */
function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, n - s);
    }
    order = next;
  }
  return order;
}

/**
 * Pair the consolation field into two rounds, everybody playing twice, nobody
 * twice against the same opponent.
 *
 * Both rounds are fixed before the night starts. That is the point: these games
 * run in the same waves as the bracket, and a pairing that waited on a result
 * would leave three teams standing around while a quarter-final finished.
 *
 * Round 1 folds the whole list — best against worst, inward. Round 2 folds
 * everyone except the last two, who play each other. That second fold shifts
 * every pairing by exactly two places, which is what makes a repeat
 * impossible: round 1 pairs i with n-1-i, round 2 pairs i with n-3-i, and
 * those are never the same edge. The last two are only paired in round 1 if
 * n is 2, which this refuses anyway.
 */
export function consolationPairs(n: number): [number, number][][] {
  if (n < 4 || n % 2 === 1) return [];

  const fold = (lo: number, hi: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = lo; i < lo + (hi - lo + 1) / 2; i++)
      out.push([i, hi - (i - lo)]);
    return out;
  };

  return [fold(0, n - 1), [...fold(0, n - 3), [n - 2, n - 1]]];
}

/**
 * Lay out the whole playoff.
 *
 * Positions follow the bracket convention so the existing advancement rule
 * applies unchanged: the winner of (round r, position p) goes to
 * (r+1, ceil(p/2)). The placement games borrow the same numbering, which is
 * what lets a quarter-final LOSER be routed the same way.
 */
export function planLeaguePlayoff(
  input: LeaguePlayoffInput,
): LeaguePlayoffPlan {
  const { seeds, topCount } = input;
  const problem = leaguePlayoffProblem(seeds.length, topCount);
  if (problem) throw new Error(problem);

  const top = seeds.slice(0, topCount);
  const bottom = seeds.slice(topCount);
  const games: PlayoffGame[] = [];

  // ── Championship, round 1: the quarter-finals ──────────────────────────
  const order = seedOrder(topCount);
  const firstRoundCount = topCount / 2;
  for (let p = 1; p <= firstRoundCount; p++) {
    games.push({
      track: "championship",
      round: 1,
      position: p,
      night: 1,
      wave: 0,
      home: { kind: "seed", seed: order[(p - 1) * 2] },
      away: { kind: "seed", seed: order[(p - 1) * 2 + 1] },
      label: roundLabel(firstRoundCount),
    });
  }

  // ── Championship, later rounds ─────────────────────────────────────────
  // Round 2 runs in wave 2 of night 1; everything after is night 2, because a
  // third game in one evening is a different promise from the one made here.
  const totalRounds = Math.log2(topCount);
  for (let r = 2; r <= totalRounds; r++) {
    const count = topCount / 2 ** r;
    for (let p = 1; p <= count; p++) {
      games.push({
        track: "championship",
        round: r,
        position: p,
        night: r === 2 ? 1 : 2,
        wave: r === 2 ? 1 : r - 3,
        home: { kind: "winner", round: r - 1, position: p * 2 - 1 },
        away: { kind: "winner", round: r - 1, position: p * 2 },
        label: roundLabel(count),
      });
    }
  }

  // The bronze game: the two beaten semi-finalists, alongside the final. It
  // sits in the final round at the position after the final, which is where
  // the advancement rule already knows to put semi-final losers.
  if (totalRounds >= 2) {
    games.push({
      track: "championship",
      round: totalRounds,
      position: 2,
      night: 2,
      wave: totalRounds - 3,
      home: { kind: "loser", round: totalRounds - 1, position: 1 },
      away: { kind: "loser", round: totalRounds - 1, position: 2 },
      label: "Bronze",
    });
  }

  // ── Placement round 1: the beaten quarter-finalists ────────────────────
  // Same wave as the semi-finals, which is the whole reason this format
  // exists — losing your first game does not end your night.
  const lowerLabel = `${topCount / 2 + 1}th–${topCount}th`;
  for (let p = 1; p <= firstRoundCount / 2; p++) {
    games.push({
      track: "placement",
      round: 1,
      position: p,
      night: 1,
      wave: 1,
      home: { kind: "loser", round: 1, position: p * 2 - 1 },
      away: { kind: "loser", round: 1, position: p * 2 },
      label: lowerLabel,
    });
  }

  // ── Placement rounds 2 and 3: the consolation field ────────────────────
  // Round 2 is wave 1, round 3 is wave 2, so these teams also play twice.
  const pairs = consolationPairs(bottom.length);
  pairs.forEach((round, i) => {
    round.forEach(([a, b], j) => {
      games.push({
        track: "placement",
        round: 2 + i,
        position: j + 1,
        night: 1,
        wave: i,
        home: { kind: "seed", seed: topCount + a + 1 },
        away: { kind: "seed", seed: topCount + b + 1 },
        label: "Consolation",
      });
    });
  });

  return { games, top, bottom, guaranteedGames: 2 };
}

/** What a round with this many games is called. */
function roundLabel(matchCount: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semi-final";
  if (matchCount === 4) return "Quarter-final";
  return `Round of ${matchCount * 2}`;
}

/**
 * What to call a stored playoff game, from its track, round and position.
 *
 * Derived rather than stored: the label is a reading of the shape, and a copy
 * in a column is a second thing that can disagree with the fixtures.
 */
export function playoffGameLabel(
  track: string | null,
  round: number,
  position: number,
  finalRound: number,
): string {
  if (track === "placement") {
    // Round 1 is the beaten first-round teams, so the game decides places
    // below the bracket's halfway point: for a top eight, 5th to 8th.
    // Anything later is the consolation field, who were never in the bracket.
    if (round !== 1) return "Consolation";
    const bracketSize = 2 ** finalRound;
    return `${bracketSize / 2 + 1}th–${bracketSize}th`;
  }
  if (round === finalRound) return position === 1 ? "Final" : "Bronze";

  // Numbered, because the games above them refer to these by number:
  // "Winner of QF2" is meaningless unless a game on the sheet says it is QF2.
  // The sheet is ordered by court, not by position, so without this the
  // reference points at nothing a reader can find.
  const gamesInRound = 2 ** (finalRound - round);
  return `${roundLabel(gamesInRound)} ${position}`;
}

/**
 * How a game is ranked for a court: the better the game, the better the floor.
 *
 * Tiers first, so a semi-final outranks a consolation game whose teams are
 * still unknown; then by the best seed playing, so the top seeds' games take
 * the prime courts rather than whichever fixture happened to be numbered first.
 */
export function courtPriority(
  g: PlayoffGame,
  seedOf: (s: TeamSource) => number | null,
): [number, number] {
  const tier =
    g.label === "Final"
      ? 0
      : g.track === "championship"
        ? 1
        : g.round === 1
          ? 2 // the beaten quarter-finalists — still top-eight teams
          : 3;
  const seeds = [seedOf(g.home), seedOf(g.away)].filter(
    (n): n is number => n != null,
  );
  return [tier, seeds.length ? Math.min(...seeds) : g.position];
}

/**
 * Where an undecided game's teams come from, e.g. "Winner of QF1".
 *
 * A blank slot on a schedule reads as a mistake. Until the quarter-final is
 * played, "Loser of QF1" IS the fixture, and it is what an organizer needs to
 * see to know the night hangs together.
 *
 * Derived from the same position arithmetic the advancement uses, so the sheet
 * and the routing cannot drift apart.
 */
export function playoffSlotSource(
  track: string | null,
  round: number,
  position: number,
  finalRound: number,
): { home: string; away: string } | null {
  const shortName = (r: number) => {
    const games = 2 ** (finalRound - r);
    if (games === 1) return "F";
    if (games === 2) return "SF";
    if (games === 4) return "QF";
    return `R${r}`;
  };

  if (track === "placement") {
    // Only the beaten first-round teams arrive here; the consolation field is
    // known from the start and never has an undecided slot.
    if (round !== 1) return null;
    return {
      home: `Loser of ${shortName(1)}${position * 2 - 1}`,
      away: `Loser of ${shortName(1)}${position * 2}`,
    };
  }

  if (round <= 1) return null;

  // The bronze game is the exception: it takes the two beaten semi-finalists,
  // not the winners of the round below.
  if (round === finalRound && position === 2) {
    return {
      home: `Loser of ${shortName(finalRound - 1)}1`,
      away: `Loser of ${shortName(finalRound - 1)}2`,
    };
  }

  const prev = shortName(round - 1);
  return {
    home: `Winner of ${prev}${position * 2 - 1}`,
    away: `Winner of ${prev}${position * 2}`,
  };
}
