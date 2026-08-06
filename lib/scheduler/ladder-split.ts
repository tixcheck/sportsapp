/**
 * Ladder league — dividing a night's target into pairings. Pure: no DB access.
 *
 * The organizer says "every team gets 6 sets tonight" (or 6 games). This turns
 * that into who plays whom, how many times. With `n` teams in a tier everyone
 * meets the other `n - 1`, so:
 *
 * - `T` divides by `n - 1` → every pairing plays `T / (n - 1)`. Three teams at
 *   6 sets: 1v2, 2v3, 3v1, three sets each.
 * - It doesn't divide → give every pairing the floor, then hand out one extra
 *   set to a set of pairings that touches each team exactly `r` times. Four
 *   teams at 4 sets: one pairing plays 2, the rest 1, everyone still gets 4.
 * - `n × T` is odd → equal is IMPOSSIBLE. Three teams at 5 sets is 15
 *   team-sets, an odd total to split between pairs of teams. Someone gets 4.
 *   The short straw rotates by week so it isn't always the same team.
 *
 * The middle case is the interesting one: finding pairings that touch every
 * team exactly `r` times is finding an `r`-regular graph on `n` vertices, which
 * we build as a circulant (connect each team to the ones `1..r/2` seats away
 * around a circle, plus the team opposite when `r` is odd).
 */

export type LadderUnit = "sets" | "games";

export interface LadderSplitInput {
  /** Teams in this tier, in any order (ranking doesn't affect the split). */
  teamIds: string[];
  /** Sets (or games) each team should get tonight. */
  target: number;
  /** Rotates who takes the short straw when an exact split is impossible. */
  week?: number;
}

export interface LadderMeeting {
  homeTeamId: string;
  awayTeamId: string;
  /** How many sets (or games) this pairing plays. Always >= 1. */
  count: number;
}

export interface LadderSplitResult {
  meetings: LadderMeeting[];
  /** What each team actually got, keyed by team id. */
  perTeam: Map<string, number>;
  /** Teams that came up short — empty when the split is exact. */
  shortedTeamIds: string[];
  /** Total sets/games played across the tier tonight (drives capacity checks). */
  total: number;
  /** Whether every team hit the target exactly. */
  exact: boolean;
}

/** Pair key helper — undirected, so (a,b) and (b,a) are the same meeting. */
function edgeKey(i: number, j: number): string {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

/**
 * Pairings forming an `r`-regular graph on `n` vertices — each team appearing
 * in exactly `r` of them. Returns one short of regular for exactly one team
 * when `n * r` is odd (no `r`-regular graph exists on an odd number of vertices
 * with odd degree). `offset` rotates which team that is.
 */
function regularPairings(
  n: number,
  r: number,
  offset: number,
): { pairs: [number, number][]; shortedIndex: number | null } {
  const pairs: [number, number][] = [];
  if (r <= 0 || n < 2) return { pairs, shortedIndex: null };

  const seen = new Set<string>();
  const push = (a: number, b: number) => {
    if (a === b) return;
    const k = edgeKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push([a, b]);
  };

  // Each "ring" at distance d contributes 2 to every team's count.
  const rings = Math.floor(r / 2);
  for (let d = 1; d <= rings; d++) {
    for (let i = 0; i < n; i++) push(i, (i + d) % n);
  }

  if (r % 2 === 1) {
    if (n % 2 === 0) {
      // Even n: the "opposite" matching adds exactly 1 to every team.
      const half = n / 2;
      for (let i = 0; i < half; i++) push(i, i + half);
      return { pairs, shortedIndex: null };
    }
    // Odd n with odd r: a perfect matching can't exist — one team sits out.
    // `offset` moves who that is from week to week.
    const out = ((offset % n) + n) % n;
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (i !== out) rest.push(i);
    for (let i = 0; i < rest.length; i += 2) push(rest[i], rest[i + 1]);
    return { pairs, shortedIndex: out };
  }

  return { pairs, shortedIndex: null };
}

/**
 * Divide a night's target across a tier's pairings as evenly as possible.
 *
 * Fewer than two teams, or a target of zero, yields no meetings — the caller
 * decides whether that's an error worth surfacing.
 */
export function splitTierNight(input: LadderSplitInput): LadderSplitResult {
  const { teamIds, target } = input;
  const n = teamIds.length;
  const week = input.week ?? 0;

  const empty: LadderSplitResult = {
    meetings: [],
    perTeam: new Map(teamIds.map((id) => [id, 0])),
    shortedTeamIds: [],
    total: 0,
    exact: target <= 0,
  };
  if (n < 2 || target <= 0) return empty;

  const meetingsPerTeam = n - 1;
  const base = Math.floor(target / meetingsPerTeam);
  const remainder = target - base * meetingsPerTeam;

  // Every pairing starts at the floor…
  const counts = new Map<string, number>();
  const indexPairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      indexPairs.push([i, j]);
      if (base > 0) counts.set(edgeKey(i, j), base);
    }
  }

  // …then a set of pairings touching each team `remainder` more times.
  const { pairs: extra, shortedIndex } = regularPairings(n, remainder, week);
  for (const [a, b] of extra) {
    const k = edgeKey(a, b);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const meetings: LadderMeeting[] = [];
  const perTeam = new Map<string, number>(teamIds.map((id) => [id, 0]));
  for (const [i, j] of indexPairs) {
    const count = counts.get(edgeKey(i, j)) ?? 0;
    if (count <= 0) continue;
    meetings.push({
      homeTeamId: teamIds[i],
      awayTeamId: teamIds[j],
      count,
    });
    perTeam.set(teamIds[i], (perTeam.get(teamIds[i]) ?? 0) + count);
    perTeam.set(teamIds[j], (perTeam.get(teamIds[j]) ?? 0) + count);
  }

  const shortedTeamIds =
    shortedIndex == null ? [] : [teamIds[shortedIndex]].filter(Boolean);
  const total = meetings.reduce((sum, m) => sum + m.count, 0);

  return {
    meetings,
    perTeam,
    shortedTeamIds,
    total,
    exact: [...perTeam.values()].every((v) => v === target),
  };
}

/**
 * Whether a tier of `n` teams can hit `target` each with every team equal.
 * False exactly when `n × target` is odd — the total is an odd number of
 * team-sets, and every set hands out two of them.
 */
export function canSplitEvenly(n: number, target: number): boolean {
  if (n < 2 || target <= 0) return true;
  return (n * target) % 2 === 0;
}

/**
 * Sets (or games) a tier of `n` teams plays in total at this target — the
 * number that has to fit the night's courts and slot length.
 */
export function tierNightVolume(n: number, target: number): number {
  if (n < 2 || target <= 0) return 0;
  return Math.floor((n * target) / 2);
}
