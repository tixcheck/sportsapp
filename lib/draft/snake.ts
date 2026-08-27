/**
 * Serpentine draft over ranked position groups. Pure: no DB access.
 *
 * The Big Shoots organizer builds his teams by ranking each position and
 * dealing them out so the strong and the weak cancel:
 *
 *   Team 1: 1/8 LS + 1/8 M + 1 RS + 4 S
 *   Team 2: 2/7 LS + 2/7 M + 2 RS + 3 S
 *   Team 3: 3/6 LS + 3/6 M + 3 RS + 2 S
 *   Team 4: 4/5 LS + 4/5 M + 4 RS + 1 S
 *
 * That whole table is one rule: a single snake that runs through the groups in
 * order and never resets between them. Within the outsides it turns at team 4
 * and comes back, so team 1 gets the 1st and the 8th. It is still turning when
 * it reaches the setters, which is why the team that took the best right side
 * takes the WORST setter — the balance is carried across groups, not rebuilt
 * inside each one. Restarting the snake per group would hand team 1 the best of
 * everything.
 */

/** Position group order for indoor 6s — the order the organizer drafts in. */
export const DEFAULT_GROUP_ORDER = [
  "Outside Hitter",
  "Middle Blocker",
  "Right Side Hitter",
  "Setter",
  "Libero",
] as const;

export interface RankedPlayer {
  id: string;
  /** Position group, e.g. "Outside Hitter". */
  position: string;
  /**
   * Strength within the group — 1 is the best. Ties (and missing ranks) fall
   * back to the order the players were passed in, so an unranked pool still
   * drafts deterministically rather than throwing.
   */
  rank?: number | null;
}

export interface SnakeDraftOptions {
  /** How many teams to deal into. */
  teams: number;
  /**
   * Which position groups to draft, in order. Anything not listed is drafted
   * after them, grouped, in first-appearance order — an unexpected position
   * should not silently drop a player from the draft.
   */
  groupOrder?: readonly string[];
}

/**
 * Deal players into teams. Returns one array of player ids per team, in pick
 * order. Every player is placed exactly once.
 */
export function snakeDraft(
  players: RankedPlayer[],
  { teams, groupOrder = DEFAULT_GROUP_ORDER }: SnakeDraftOptions,
): string[][] {
  const out: string[][] = Array.from({ length: Math.max(0, teams) }, () => []);
  if (out.length === 0 || players.length === 0) return out;

  // Group order: the configured groups first, then anything unexpected in the
  // order it turned up.
  const seen = players.map((p) => p.position);
  const groups = [
    ...groupOrder.filter((g) => seen.includes(g)),
    ...seen.filter((g, i) => !groupOrder.includes(g) && seen.indexOf(g) === i),
  ];

  let team = 0;
  let step = 1;

  for (const group of groups) {
    const inGroup = players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.position === group)
      // Rank ascending, then original order — a stable tiebreak matters because
      // an unranked pool is the normal case before a season has been played.
      .sort(
        (a, b) => (a.p.rank ?? Infinity) - (b.p.rank ?? Infinity) || a.i - b.i,
      );

    for (const { p } of inGroup) {
      out[team].push(p.id);
      const next = team + step;
      // At either end the snake turns and the same team picks again — that
      // double pick is what pairs the 1st and the 8th on one roster.
      if (next < 0 || next >= out.length) step = -step;
      else team = next;
    }
  }

  return out;
}

/**
 * A player's rank within their own position group, 1-based, from their order in
 * the given list. Used to seed ranks for a pool that has never been ranked.
 */
export function seedRanks<T extends { id: string; position: string }>(
  players: T[],
): Map<string, number> {
  const nextRank = new Map<string, number>();
  const ranks = new Map<string, number>();
  for (const p of players) {
    const r = (nextRank.get(p.position) ?? 0) + 1;
    nextRank.set(p.position, r);
    ranks.set(p.id, r);
  }
  return ranks;
}
