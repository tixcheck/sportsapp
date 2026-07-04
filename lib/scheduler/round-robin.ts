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
   * Cap each team at this many games (a partial round robin). The circle method
   * emits a distinct, evenly-spread opponent per round, so taking the first N
   * rounds gives every team N different opponents with no repeats. Null/omitted
   * or a value ≥ a full round robin means play the full schedule.
   */
  gamesPerTeam?: number | null;
  /** Courts available per slot (≥1). */
  courts: number;
  /** First slot date, "YYYY-MM-DD". */
  startDate: string;
  /** Days between slots. Default 7 (weekly). */
  intervalDays?: number;
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

/**
 * Generate the round-robin pairings. Every pair of teams meets `roundsPerTeam`
 * times; odd counts get a rotating bye each round; home/away alternates for
 * balance and the second meeting reverses the fixture.
 */
export function generatePairings(
  teamIds: TeamId[],
  roundsPerTeam = 1,
  gamesPerTeam?: number | null,
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

  // Partial round robin: keep only the first `gamesPerTeam` rounds. Each round is
  // one game per team (the byed team in an odd pool plays one fewer), so N rounds
  // ⇒ N games each, with distinct opponents while N ≤ a single full cycle.
  if (
    gamesPerTeam != null &&
    gamesPerTeam >= 1 &&
    gamesPerTeam < result.length
  ) {
    return result.slice(0, gamesPerTeam);
  }

  return result;
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
  const blackout = new Set(input.blackoutDates ?? []);
  const pairings = generatePairings(
    input.teamIds,
    input.roundsPerTeam ?? 1,
    input.gamesPerTeam,
  );

  let cursor = parseDate(input.startDate);
  const rounds: ScheduledRound[] = pairings.map((pr) => {
    while (blackout.has(formatDate(cursor))) cursor += intervalDays * DAY_MS;
    const date = formatDate(cursor);
    cursor += intervalDays * DAY_MS;

    const matches: ScheduledMatch[] = pr.pairs.map((p, i) => ({
      round: pr.round,
      date,
      court: ((i + pr.round) % input.courts) + 1,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
    }));

    return { round: pr.round, date, byeTeamId: pr.byeTeamId, matches };
  });

  return { rounds };
}
