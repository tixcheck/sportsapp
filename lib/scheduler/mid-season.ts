/**
 * Mid-season roster addition (PRD §7 extension). Pure: no DB access.
 *
 * A league has already played some weeks when new pairs join. We must NOT touch
 * the games already played — their results are frozen — so we can't just
 * regenerate the season: a fresh round robin wouldn't reproduce the fixtures
 * that were actually played. Instead we take the played fixtures as fixed, then
 * fill the remaining week slots with new games that:
 *   - never repeat a pairing that was already played,
 *   - bring every returning team up to its target game count,
 *   - give each new team as many games as the remaining weeks allow.
 *
 * Slot assignment mirrors `generateRoundRobin`: `gamesPerWeek` rounds share a
 * week date, stepping to the next remaining week date after each group.
 */

export type TeamId = string;

export interface PlannedMatch {
  /** 0-based index into the remaining round slots (week * gamesPerWeek + wave). */
  slot: number;
  weekDate: string;
  /** 0-based game-of-the-week. */
  wave: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** A catch-up game beyond the standard 2/week (mode B doubleheader). */
  makeup: boolean;
}

export interface MidSeasonPlan {
  matches: PlannedMatch[];
  /** teamId -> games it will have played once this plan is applied (played + new). */
  finalGamesByTeam: Record<TeamId, number>;
  /** Teams that couldn't reach their target within the remaining weeks. */
  shortfalls: { teamId: TeamId; got: number; target: number }[];
  /** True when the matching search couldn't place every intended game. */
  incomplete: boolean;
}

export interface MidSeasonInput {
  teamIds: TeamId[];
  /** Games each team has already played (frozen). Missing = 0. */
  playedGamesByTeam?: Record<TeamId, number>;
  /** Unordered "a|b" keys of fixtures already played — never repeated. */
  playedPairs?: string[];
  /** Target total games per team over the whole season (e.g. 12). */
  targetGames: number;
  /** Ordered week dates still available to schedule into ("YYYY-MM-DD"). */
  remainingWeekDates: string[];
  /** Standard games each team plays per week (e.g. 2). */
  gamesPerWeek: number;
  /**
   * Teams that need catch-up games to hit `targetGames` when the remaining weeks
   * can't fit them at the standard rate (the new pairs). They play each other in
   * extra waves. Omitted / empty = mode A (no doubleheaders).
   */
  makeupTeamIds?: TeamId[];
  /** Deterministic tie-breaking in the matching search. Default 1. */
  seed?: number;
}

export function pairKey(a: TeamId, b: TeamId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * One round: pair up teams that still owe games, skipping any forbidden pair.
 * Backtracks so it returns a matching whenever one exists (not just a greedy
 * best-effort), and prefers pairing the teams with the most games still owed so
 * nobody is left stranded at the end. An odd count leaves the least-owed team
 * out (a bye this round).
 *
 * `capacity` is how many teams may play this round (some rounds run an extra
 * wave for make-ups only); it caps the matching size, not who is eligible.
 */
function matchRound(
  need: Map<TeamId, number>,
  forbidden: Set<string>,
  rng: () => number,
  capacity: number,
): { homeTeamId: TeamId; awayTeamId: TeamId }[] | null {
  const eligible = [...need.entries()]
    .filter(([, n]) => n > 0)
    .map(([id]) => id);
  if (eligible.length < 2) return [];

  // Most-owed first, with a seeded shuffle to break ties fairly across rounds.
  shuffle(eligible, rng);
  eligible.sort((a, b) => need.get(b)! - need.get(a)!);

  const maxGames = Math.min(Math.floor(eligible.length / 2), capacity);

  const chosen: { homeTeamId: TeamId; awayTeamId: TeamId }[] = [];
  const used = new Set<TeamId>();

  const backtrack = (): boolean => {
    if (chosen.length === maxGames) return true;
    // Next unused, highest-owed team anchors this game.
    const anchor = eligible.find((t) => !used.has(t));
    if (anchor === undefined) return true;

    used.add(anchor);
    for (const other of eligible) {
      if (used.has(other) || other === anchor) continue;
      if (forbidden.has(pairKey(anchor, other))) continue;
      used.add(other);
      chosen.push({ homeTeamId: anchor, awayTeamId: other });
      if (backtrack()) return true;
      chosen.pop();
      used.delete(other);
    }
    // Anchor can't be paired without a forbidden edge; drop it (bye) and go on,
    // but only if the teams still free can fill the remaining games. `used` holds
    // the anchor plus the already-paired teams, so `eligible - used` is exactly
    // what's left once the anchor byes.
    if (eligible.length - used.size >= (maxGames - chosen.length) * 2) {
      return backtrack();
    }
    used.delete(anchor);
    return false;
  };

  return backtrack() ? chosen : null;
}

/** Fill the standard week slots for one random seed; caller judges the result. */
function attemptStandardRounds(
  input: MidSeasonInput,
  need: Map<TeamId, number>,
  seed: number,
): { matches: PlannedMatch[]; incomplete: boolean } {
  const { remainingWeekDates, gamesPerWeek } = input;
  const rng = mulberry32(seed);
  const forbidden = new Set(input.playedPairs ?? []);
  const slotCount = remainingWeekDates.length * Math.max(1, gamesPerWeek);
  const matches: PlannedMatch[] = [];
  let incomplete = false;

  for (let slot = 0; slot < slotCount; slot++) {
    const round = matchRound(need, forbidden, rng, Infinity);
    if (round === null) {
      incomplete = true;
      continue;
    }
    const weekIdx = Math.floor(slot / gamesPerWeek);
    const wave = slot % gamesPerWeek;
    for (const p of round) {
      matches.push({
        slot,
        weekDate: remainingWeekDates[weekIdx],
        wave,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        makeup: false,
      });
      forbidden.add(pairKey(p.homeTeamId, p.awayTeamId));
      need.set(p.homeTeamId, need.get(p.homeTeamId)! - 1);
      need.set(p.awayTeamId, need.get(p.awayTeamId)! - 1);
    }
  }
  return { matches, incomplete };
}

export function planMidSeasonSchedule(input: MidSeasonInput): MidSeasonPlan {
  const { teamIds, targetGames, remainingWeekDates, gamesPerWeek } = input;
  const played = input.playedGamesByTeam ?? {};
  const makeupTeams = new Set(input.makeupTeamIds ?? []);
  const slotCount = remainingWeekDates.length * Math.max(1, gamesPerWeek);

  // Most a team can play in the standard rounds: one game per remaining slot,
  // capped by what it still owes. Greedy round-by-round matching can strand a
  // team on a bye and undershoot this, so we retry with fresh random orderings
  // (a valid edge-disjoint decomposition provably exists) and keep the best.
  const owed = (id: TeamId) => Math.max(0, targetGames - (played[id] ?? 0));
  const expected = new Map(
    teamIds.map((id) => [id, Math.min(owed(id), slotCount)]),
  );

  let best: { matches: PlannedMatch[]; need: Map<TeamId, number> } | null =
    null;
  let bestShort = Infinity;

  const baseSeed = input.seed ?? 1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const need = new Map(teamIds.map((id) => [id, owed(id)]));
    const { matches } = attemptStandardRounds(input, need, baseSeed + attempt);

    // Shortfall = teams that fell below what they could have played.
    let short = 0;
    for (const id of teamIds) {
      const got = owed(id) - (need.get(id) ?? 0);
      short += Math.max(0, expected.get(id)! - got);
    }
    if (short < bestShort) {
      bestShort = short;
      best = { matches, need };
      if (short === 0) break;
    }
  }

  const matches = best!.matches;
  const need = best!.need;
  const incomplete = bestShort > 0;

  // Make-up games (mode B): teams still short after the standard rounds — the
  // new pairs — play each other in extra waves so no returning team is pushed
  // past its target.
  if (makeupTeams.size > 0) {
    placeMakeups(matches, need, makeupTeams, remainingWeekDates, gamesPerWeek);
  }

  const finalGamesByTeam: Record<TeamId, number> = {};
  for (const id of teamIds) {
    finalGamesByTeam[id] = targetGames - Math.max(0, need.get(id) ?? 0);
  }

  const shortfalls = teamIds
    .filter((id) => (need.get(id) ?? 0) > 0)
    .map((id) => ({
      teamId: id,
      got: finalGamesByTeam[id],
      target: targetGames,
    }));

  return { matches, finalGamesByTeam, shortfalls, incomplete };
}

/**
 * Pair up still-short teams among themselves (the new pairs) to top them up,
 * one extra wave at a time, never touching a team that's already at target.
 * Repeats between the same short teams are allowed here — that's the accepted
 * cost of catching up a late joiner without inflating anyone else's count.
 */
function placeMakeups(
  matches: PlannedMatch[],
  need: Map<TeamId, number>,
  makeupTeams: Set<TeamId>,
  remainingWeekDates: string[],
  gamesPerWeek: number,
): void {
  const extraWaveByWeek = new Map<number, number>();
  let weekIdx = 0;

  const short = () => [...makeupTeams].filter((id) => (need.get(id) ?? 0) > 0);

  let guard = 0;
  while (short().length >= 2 && guard++ < 500) {
    const owed = short().sort((a, b) => need.get(b)! - need.get(a)!);
    const home = owed[0];
    const away = owed[1];

    const wave = gamesPerWeek + (extraWaveByWeek.get(weekIdx) ?? 0);
    extraWaveByWeek.set(weekIdx, (extraWaveByWeek.get(weekIdx) ?? 0) + 1);

    matches.push({
      slot: weekIdx * gamesPerWeek + wave,
      weekDate:
        remainingWeekDates[Math.min(weekIdx, remainingWeekDates.length - 1)],
      wave,
      homeTeamId: home,
      awayTeamId: away,
      makeup: true,
    });
    need.set(home, need.get(home)! - 1);
    need.set(away, need.get(away)! - 1);

    weekIdx = (weekIdx + 1) % Math.max(1, remainingWeekDates.length);
  }
}
