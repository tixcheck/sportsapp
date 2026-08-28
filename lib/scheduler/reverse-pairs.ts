/**
 * Reverse Pairs scheduling. Pure: no DB access.
 *
 * A pair signs up together and stays a pair all night. Each game, three pairs
 * are joined into a team of six and play three other pairs. The appeal is that
 * you play alongside as many different people as possible, which makes the
 * schedule a combinatorial problem rather than a rotation.
 *
 * Two courts hold twelve pairs. Bring fifteen and three sit out every game;
 * bring sixteen and four do. So a draw has to balance two things at once, and
 * the second one is the one players actually notice:
 *
 *  1. Nobody teamed with the same pair twice, for as long as that is possible.
 *  2. Everybody playing the same number of games.
 *
 * Sitting out one more game than the pair next to you is the complaint that
 * ends a night, so balance is enforced as a hard constraint — weighted far
 * above partner variety in the search — while partner variety is optimised
 * underneath it. `suggestRounds` exists so the organizer can pick a round count
 * where the division is exact and nobody sits out more than anyone else at all.
 *
 * Greedy construction does not get close on the partner objective: building
 * each round to look good on its own paints later rounds into a corner. So the
 * whole schedule is optimised at once by simulated annealing over swaps, seeded
 * so the same input always yields the same draw.
 *
 * Opponents are balanced afterwards, as a distant third objective. With three
 * pairs a side you meet nine opponents a game and gain only two partners, so
 * opponent variety comes nearly free while partner variety is the scarce thing.
 */

export type PairId = string;

export interface ReversePairsInput {
  /** The pairs, in any order. */
  pairIds: PairId[];
  /** Courts in use. Each court holds two teams of three, so six pairs. */
  courts: number;
  /** Games in the night. Pairs beyond court capacity sit out, in rotation. */
  rounds: number;
  /**
   * Deterministic seed. The same input and seed always produce the same draw,
   * so regenerating a night doesn't reshuffle everybody.
   */
  seed?: number;
  /** Search effort per attempt. Defaults to a size-appropriate budget. */
  iterations?: number;
  /**
   * Independent attempts, best draw wins. Annealing lands in a different local
   * minimum from each starting point and a run costs a fraction of a second, so
   * a handful of restarts is the cheapest quality available.
   */
  restarts?: number;
}

export interface ReversePairsGame {
  /** 1-based game (round). */
  game: number;
  /** 1-based court. Courts within a game run in parallel. */
  court: number;
  /** The three pairs forming each team of six. */
  teamA: [PairId, PairId, PairId];
  teamB: [PairId, PairId, PairId];
}

export interface ReversePairsQuality {
  /** Times a pair is teamed with someone they have already been teamed with. */
  repeatPartnerships: number;
  /** Distinct partnerships used, out of `n * (n - 1) / 2`. */
  distinctPartnerships: number;
  /** The most distinct partners the least-playing pair could have. */
  ceiling: number;
  /** Fewest and most distinct partners across the field. */
  minPartners: number;
  maxPartners: number;
  /** Games played by the least- and most-used pair. Equal is the goal. */
  minGames: number;
  maxGames: number;
  /** True when every pair plays exactly the same number of games. */
  evenGames: boolean;
}

export interface ReversePairsResult {
  games: ReversePairsGame[];
  /** Who sat out each game, indexed by round. Empty when everyone plays. */
  byes: PairId[][];
  /**
   * How good the draw is, stated for the organizer rather than the algorithm.
   * A draw is perfect when `repeatPartnerships` is 0 and `evenGames` is true.
   */
  quality: ReversePairsQuality;
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

/**
 * Why a field can't be scheduled, or null if it can.
 *
 * Returned rather than thrown so a form can say what is wrong while the
 * organizer is still typing. `generateReversePairs` throws on the same
 * conditions, because by the time it is called this is a bug.
 */
export function reversePairsProblem(
  pairCount: number,
  courts: number,
  rounds: number,
): string | null {
  if (!Number.isInteger(courts) || courts < 1) {
    return "Reverse Pairs needs at least one court.";
  }
  const needed = courts * 6;
  if (pairCount < needed) {
    return `${courts} court${courts === 1 ? "" : "s"} needs ${needed} pairs on court — you have ${pairCount}.`;
  }
  if (!Number.isInteger(rounds) || rounds < 1) {
    return "Play at least one game.";
  }
  return null;
}

/**
 * Round counts where every pair plays exactly the same number of games.
 *
 * With more pairs than court space, some sit out each game, and the byes only
 * divide evenly at certain round counts. Fifteen pairs on two courts works at
 * 5, 10, 15…; sixteen at 4, 8, 12…. Offering those up front is better than
 * letting an organizer pick 6 and then explaining why three of his pairs got an
 * extra game.
 */
export function suggestRounds(
  pairCount: number,
  courts: number,
  range: { min?: number; max?: number } = {},
): { rounds: number; gamesPerPair: number }[] {
  const min = range.min ?? 1;
  const max = range.max ?? 16;
  const slots = courts * 6;
  if (pairCount < slots || slots < 1) return [];

  const out: { rounds: number; gamesPerPair: number }[] = [];
  for (let r = min; r <= max; r++) {
    if ((slots * r) % pairCount === 0) {
      out.push({ rounds: r, gamesPerPair: (slots * r) / pairCount });
    }
  }
  return out;
}

/** Unordered key for a partnership, so {a,b} and {b,a} collide. */
function key(a: number, b: number): number {
  return a < b ? a * 4096 + b : b * 4096 + a;
}

/** Repeats contributed by a partnership seen `v` times. */
function excess(v: number): number {
  return v > 1 ? v - 1 : 0;
}

/**
 * Playing an unequal number of games is weighted far above partner variety.
 * A player will forgive meeting the same pair twice; they will not forgive
 * sitting out more often than the pair next to them.
 */
const IMBALANCE_WEIGHT = 50;

interface Round {
  /** `teams[t]` holds the three pair indices on team t. */
  teams: number[][];
  /** Pairs sitting this one out. */
  bench: number[];
}

/** How far a pair's game count sits outside the allowed band. */
function outOfBand(played: number, lo: number, hi: number): number {
  if (played < lo) return lo - played;
  if (played > hi) return played - hi;
  return 0;
}

/**
 * Assign pairs to teams for every round, maximising distinct partnerships while
 * keeping games-played level. Returns rounds of team indices into `pairIds`.
 */
function optimise(
  n: number,
  courts: number,
  rounds: number,
  rng: () => number,
  iterations: number,
): { rounds: Round[]; cost: number } {
  const teamsPerRound = courts * 2;
  const onCourt = courts * 6;
  const total = onCourt * rounds;
  const lo = Math.floor(total / n);
  const hi = Math.ceil(total / n);

  // Start from a rotating bye order, which is already balanced. Annealing then
  // has a valid schedule to improve rather than a broken one to repair.
  const schedule: Round[] = [];
  let cursor = 0;
  for (let r = 0; r < rounds; r++) {
    const order: number[] = [];
    for (let i = 0; i < n; i++) order.push((cursor + i) % n);
    cursor = (cursor + (n - onCourt)) % n;
    for (let i = order.length - 1; i > onCourt; i--) {
      // Shuffle only the playing block; the bench block stays as the rotation
      // chose it, so the starting point is balanced by construction.
      const j = onCourt + Math.floor(rng() * (i - onCourt + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = onCourt - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const teams: number[][] = [];
    for (let t = 0; t < teamsPerRound; t++) {
      teams.push(order.slice(t * 3, t * 3 + 3));
    }
    schedule.push({ teams, bench: order.slice(onCourt) });
  }

  const used = new Map<number, number>();
  const played = new Array<number>(n).fill(0);
  for (const round of schedule) {
    for (const team of round.teams) {
      for (const p of team) played[p]++;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const k = key(team[i], team[j]);
          used.set(k, (used.get(k) ?? 0) + 1);
        }
      }
    }
  }

  let cost = 0;
  for (const v of used.values()) cost += excess(v);
  for (let i = 0; i < n; i++) {
    cost += IMBALANCE_WEIGHT * outOfBand(played[i], lo, hi);
  }

  const T0 = 2.5;
  const T1 = 0.02;
  for (let it = 0; it < iterations && cost > 0; it++) {
    const temperature = T0 * Math.pow(T1 / T0, it / iterations);
    const round = schedule[Math.floor(rng() * rounds)];

    // Two moves. Team-to-team rearranges who plays with whom; bench-to-team
    // changes who plays at all, which is the only way byes can move — without
    // it a bad opening rotation would be permanent.
    const benchMove = round.bench.length > 0 && rng() < 0.35;

    let delta = 0;
    const touched = new Map<number, number>();
    const apply = (x: number, y: number, by: number) => {
      const k = key(x, y);
      const before = (used.get(k) ?? 0) + (touched.get(k) ?? 0);
      touched.set(k, (touched.get(k) ?? 0) + by);
      delta += excess(before + by) - excess(before);
    };

    if (benchMove) {
      const bi = Math.floor(rng() * round.bench.length);
      const ti = Math.floor(rng() * teamsPerRound);
      const si = Math.floor(rng() * 3);
      const team = round.teams[ti];
      const sitting = round.bench[bi];
      const playing = team[si];
      const others = [team[(si + 1) % 3], team[(si + 2) % 3]];

      for (const o of others) apply(playing, o, -1);
      for (const o of others) apply(sitting, o, +1);

      delta +=
        IMBALANCE_WEIGHT *
        (outOfBand(played[playing] - 1, lo, hi) -
          outOfBand(played[playing], lo, hi) +
          outOfBand(played[sitting] + 1, lo, hi) -
          outOfBand(played[sitting], lo, hi));

      if (
        delta <= 0 ||
        rng() < Math.exp(-delta / Math.max(temperature, 1e-9))
      ) {
        for (const [k, by] of touched) {
          const next = (used.get(k) ?? 0) + by;
          if (next === 0) used.delete(k);
          else used.set(k, next);
        }
        team[si] = sitting;
        round.bench[bi] = playing;
        played[playing]--;
        played[sitting]++;
        cost += delta;
      }
      continue;
    }

    const i = Math.floor(rng() * teamsPerRound);
    let j = Math.floor(rng() * teamsPerRound);
    if (i === j) j = (j + 1) % teamsPerRound;
    if (i === j) continue; // one team in the round: nothing to swap with
    const a = Math.floor(rng() * 3);
    const b = Math.floor(rng() * 3);

    const ti = round.teams[i];
    const tj = round.teams[j];
    const moved = ti[a];
    const incoming = tj[b];
    const iOthers = [ti[(a + 1) % 3], ti[(a + 2) % 3]];
    const jOthers = [tj[(b + 1) % 3], tj[(b + 2) % 3]];

    for (const o of iOthers) apply(moved, o, -1);
    for (const o of jOthers) apply(incoming, o, -1);
    for (const o of iOthers) apply(incoming, o, +1);
    for (const o of jOthers) apply(moved, o, +1);

    if (delta <= 0 || rng() < Math.exp(-delta / Math.max(temperature, 1e-9))) {
      for (const [k, by] of touched) {
        const next = (used.get(k) ?? 0) + by;
        if (next === 0) used.delete(k);
        else used.set(k, next);
      }
      ti[a] = incoming;
      tj[b] = moved;
      cost += delta;
    }
  }

  return { rounds: schedule, cost };
}

/** Every partnership in a schedule, and how often it occurs. */
function partnershipCounts(schedule: Round[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const round of schedule) {
    for (const team of round.teams) {
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const k = key(team[i], team[j]);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/**
 * Pair a round's teams into matches, preferring opponents who have met least.
 *
 * Greedy is right here where it was wrong for partners: opponents are plentiful
 * (nine a game against two partners), so there is no corner to paint into.
 */
function matchOpponents(
  teams: number[][],
  faced: Map<number, number>,
): [number[], number[]][] {
  const remaining = teams.map((_, i) => i);
  const out: [number[], number[]][] = [];

  const between = (a: number[], b: number[]) => {
    let n = 0;
    for (const x of a) for (const y of b) n += faced.get(key(x, y)) ?? 0;
    return n;
  };

  while (remaining.length > 1) {
    const first = remaining.shift()!;
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = between(teams[first], teams[remaining[i]]);
      if (c < bestCost) {
        bestCost = c;
        best = i;
      }
    }
    const [other] = remaining.splice(best, 1);
    for (const x of teams[first]) {
      for (const y of teams[other]) {
        const k = key(x, y);
        faced.set(k, (faced.get(k) ?? 0) + 1);
      }
    }
    out.push([teams[first], teams[other]]);
  }
  return out;
}

/**
 * Build a Reverse Pairs night: everyone playing the same number of games,
 * teamed with as many different pairs as those games allow.
 */
export function generateReversePairs(
  input: ReversePairsInput,
): ReversePairsResult {
  const { pairIds, courts, rounds } = input;
  const problem = reversePairsProblem(pairIds.length, courts, rounds);
  if (problem) throw new Error(problem);

  const n = pairIds.length;
  const seed = input.seed ?? 1;
  // Effort in proportion to the problem. A single-court field has very few
  // possible swaps and converges immediately; burning a fixed budget on it just
  // makes the smallest night the slowest to draw.
  const iterations =
    input.iterations ?? Math.min(250_000, Math.max(20_000, n * rounds * 900));
  const restarts = Math.max(1, input.restarts ?? 6);

  let best: Round[] | null = null;
  let bestCost = Infinity;
  for (let attempt = 0; attempt < restarts && bestCost > 0; attempt++) {
    // Each restart gets its own stream, derived from the seed so the whole
    // search stays reproducible.
    const candidate = optimise(
      n,
      courts,
      rounds,
      mulberry32(seed + attempt * 0x9e3779b9),
      iterations,
    );
    if (candidate.cost < bestCost) {
      bestCost = candidate.cost;
      best = candidate.rounds;
    }
  }
  const schedule = best!;

  const faced = new Map<number, number>();
  const games: ReversePairsGame[] = [];
  const byes: PairId[][] = [];
  schedule.forEach((round, gi) => {
    matchOpponents(round.teams, faced).forEach(([a, b], ci) => {
      games.push({
        game: gi + 1,
        court: ci + 1,
        teamA: [pairIds[a[0]], pairIds[a[1]], pairIds[a[2]]],
        teamB: [pairIds[b[0]], pairIds[b[1]], pairIds[b[2]]],
      });
    });
    byes.push(round.bench.map((i) => pairIds[i]));
  });

  // Quality is measured from the finished schedule rather than carried out of
  // the search: a number the organizer can trust is a number about the thing he
  // was actually given.
  const counts = partnershipCounts(schedule);
  const partners = new Array<number>(n).fill(0);
  let repeats = 0;
  for (const [k, v] of counts) {
    repeats += excess(v);
    partners[Math.floor(k / 4096)]++;
    partners[k % 4096]++;
  }
  const played = new Array<number>(n).fill(0);
  for (const round of schedule) {
    for (const team of round.teams) for (const p of team) played[p]++;
  }
  const minGames = Math.min(...played);
  const maxGames = Math.max(...played);

  return {
    games,
    byes,
    quality: {
      repeatPartnerships: repeats,
      distinctPartnerships: counts.size,
      // Measured off the least-playing pair: what the worst-served pair can
      // hope for is the honest ceiling, not what the best-served one gets.
      ceiling: Math.min(2 * minGames, n - 1),
      minPartners: Math.min(...partners),
      maxPartners: Math.max(...partners),
      minGames,
      maxGames,
      evenGames: minGames === maxGames,
    },
  };
}
