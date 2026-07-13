/**
 * Round-robin scheduling via the circle method / Berger tables (PRD §7). Pure:
 * no DB access. `generatePairings` is the reusable combinatorial core (also
 * used by pools.ts); `generateRoundRobin` lays those pairings onto a calendar
 * with courts and blackout handling.
 */

export type TeamId = string;

export interface PairingRound {
  round: number;
  pairs: { homeTeamId: TeamId; awayTeamId: TeamId }[];
  /** The team sitting out this round (odd team counts), else null. */
  byeTeamId: TeamId | null;
}

export interface RoundRobinInput {
  teamIds: TeamId[];
  /** How many times each pair meets (1× or 2×). Default 1. */
  roundsPerTeam?: number;
  /**
   * How many games each team plays. The circle method emits a distinct,
   * evenly-spread opponent per round, so the first N rounds give every team N
   * different opponents with no repeats. If N exceeds a single full round robin
   * (e.g. 12 games among 12 teams, where everyone-once is only 11), the extra
   * games are added as randomized rematch rounds — each a valid full round that
   * avoids pairing teams who just played the previous round. Null/omitted plays
   * the full single round robin.
   */
  gamesPerTeam?: number | null;
  /**
   * Seeds the randomized rematch rounds (see `gamesPerTeam`). Deterministic per
   * seed, so regenerating a league yields the same rematch. Default 1.
   */
  seed?: number;
  /** Courts available per slot (≥1). */
  courts: number;
  /** First slot date, "YYYY-MM-DD". */
  startDate: string;
  /** Days between slots. Default 7 (weekly). */
  intervalDays?: number;
  /**
   * Games each team plays per slot/week. Default 1. With N, the first N rounds
   * share the first date, the next N the second date, etc. — so a 12-game season
   * at 2/week runs 6 weeks instead of 12. Games in the same week are staggered by
   * time (the `wave` index below), so a team never plays two at once.
   */
  gamesPerWeek?: number;
  /** Dates to skip, "YYYY-MM-DD". */
  blackoutDates?: string[];
}

export interface ScheduledMatch {
  round: number;
  date: string;
  court: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
}

export interface ScheduledRound {
  round: number;
  date: string;
  /** 0-based game-of-the-week — 0 = first game that night, 1 = second, … */
  wave: number;
  byeTeamId: TeamId | null;
  matches: ScheduledMatch[];
}

export interface RoundRobinResult {
  rounds: ScheduledRound[];
}

const BYE = null;

/** Circle-method rotation: keep slot 0 fixed, rotate the rest clockwise. */
function rotate(slots: number[]): void {
  const rest = slots.slice(1);
  rest.unshift(rest.pop()!);
  for (let i = 1; i < slots.length; i++) slots[i] = rest[i - 1];
}

/** Small deterministic PRNG (mulberry32) — a seed in, a [0,1) stream out. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher–Yates shuffle driven by `rng`. */
function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Unordered pair key so {a,b} and {b,a} collide. */
function pairKey(a: TeamId, b: TeamId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * A random perfect matching of an even set of teams into pairs, avoiding any
 * pair in `avoid` (e.g. the fixtures they just played). Rejection-samples a
 * shuffle; for realistic sizes a clean draw comes almost immediately, and the
 * bounded fallback pairs sequentially so a matching is always returned.
 */
function randomMatching(
  teamIds: TeamId[],
  avoid: Set<string>,
  rng: () => number,
): PairingRound["pairs"] {
  const n = teamIds.length;
  for (let attempt = 0; attempt < 500; attempt++) {
    const order = [...teamIds];
    shuffle(order, rng);
    const pairs: PairingRound["pairs"] = [];
    let ok = true;
    for (let i = 0; i < n; i += 2) {
      if (avoid.has(pairKey(order[i], order[i + 1]))) {
        ok = false;
        break;
      }
      pairs.push({ homeTeamId: order[i], awayTeamId: order[i + 1] });
    }
    if (ok) return pairs;
  }
  const pairs: PairingRound["pairs"] = [];
  for (let i = 0; i < n; i += 2) {
    pairs.push({ homeTeamId: teamIds[i], awayTeamId: teamIds[i + 1] });
  }
  return pairs;
}

/**
 * Generate the round-robin pairings. Every pair of teams meets `roundsPerTeam`
 * times; odd counts get a rotating bye each round; home/away alternates for
 * balance and the second meeting reverses the fixture.
 */
export function generatePairings(
  teamIds: TeamId[],
  roundsPerTeam = 1,
  gamesPerTeam?: number | null,
  seed = 1,
): PairingRound[] {
  const result: PairingRound[] = [];
  if (teamIds.length < 2) return result;

  const teams: (TeamId | null)[] = [...teamIds];
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;

  const roundsPerCycle = n - 1;
  let roundNo = 0;

  for (let cycle = 0; cycle < roundsPerTeam; cycle++) {
    const slots = teams.map((_, i) => i);
    for (let r = 0; r < roundsPerCycle; r++) {
      roundNo += 1;
      const pairs: PairingRound["pairs"] = [];
      let byeTeamId: TeamId | null = null;

      for (let i = 0; i < n / 2; i++) {
        let homeIdx = slots[i];
        let awayIdx = slots[n - 1 - i];
        // Alternate home/away across pairs/rounds, and flip on the 2nd cycle
        // so each team hosts each opponent once over a 2× schedule.
        if ((r + i) % 2 === 1) [homeIdx, awayIdx] = [awayIdx, homeIdx];
        if (cycle % 2 === 1) [homeIdx, awayIdx] = [awayIdx, homeIdx];

        const home = teams[homeIdx];
        const away = teams[awayIdx];
        if (home === BYE) byeTeamId = away;
        else if (away === BYE) byeTeamId = home;
        else pairs.push({ homeTeamId: home, awayTeamId: away });
      }

      result.push({ round: roundNo, pairs, byeTeamId });
      rotate(slots);
    }
  }

  if (gamesPerTeam == null || gamesPerTeam < 1) return result;

  // Partial round robin: keep only the first `gamesPerTeam` rounds. Each round is
  // one game per team (the byed team in an odd pool plays one fewer), so N rounds
  // ⇒ N games each, with distinct opponents while N ≤ a single full cycle.
  if (gamesPerTeam <= roundsPerCycle) {
    return result.slice(0, gamesPerTeam);
  }

  // More games than everyone-once (e.g. 12 games among 12 teams). Keep the full
  // distinct-opponent cycle, then top up with randomized rematch rounds — each a
  // valid full round that avoids repeating the immediately preceding fixtures.
  // Rematch rounds need a clean perfect matching, which we only guarantee for an
  // even team count; odd pools fall back to the full-cycle prefix.
  if (teamIds.length % 2 === 1) return result.slice(0, roundsPerCycle);

  const rounds = result.slice(0, roundsPerCycle);
  const rng = mulberry32(seed);
  let prev = rounds[rounds.length - 1]?.pairs ?? [];
  while (rounds.length < gamesPerTeam) {
    const avoid = new Set(prev.map((p) => pairKey(p.homeTeamId, p.awayTeamId)));
    const pairs = randomMatching(teamIds, avoid, rng);
    rounds.push({ round: rounds.length + 1, pairs, byeTeamId: null });
    prev = pairs;
  }
  return rounds;
}

// --- calendar helpers ------------------------------------------------------

const DAY_MS = 86_400_000;

function parseDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Lay the round-robin pairings onto a weekly calendar: assign each round the
 * next non-blackout slot date and rotate court numbers so no team is always on
 * court 1.
 */
export function generateRoundRobin(input: RoundRobinInput): RoundRobinResult {
  if (input.courts < 1) throw new Error("courts must be at least 1");

  const intervalDays = input.intervalDays ?? 7;
  const gamesPerWeek = Math.max(1, Math.floor(input.gamesPerWeek ?? 1));
  const blackout = new Set(input.blackoutDates ?? []);
  const pairings = generatePairings(
    input.teamIds,
    input.roundsPerTeam ?? 1,
    input.gamesPerTeam,
    input.seed ?? 1,
  );

  let cursor = parseDate(input.startDate);
  const skipBlackouts = () => {
    while (blackout.has(formatDate(cursor))) cursor += intervalDays * DAY_MS;
  };
  skipBlackouts();

  const rounds: ScheduledRound[] = pairings.map((pr, idx) => {
    const wave = idx % gamesPerWeek;
    // Advance to the next playable date at the start of each new week's games.
    if (idx > 0 && wave === 0) {
      cursor += intervalDays * DAY_MS;
      skipBlackouts();
    }
    const date = formatDate(cursor);

    const matches: ScheduledMatch[] = pr.pairs.map((p, i) => ({
      round: pr.round,
      date,
      court: ((i + pr.round) % input.courts) + 1,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
    }));

    return { round: pr.round, date, wave, byeTeamId: pr.byeTeamId, matches };
  });

  return { rounds };
}
