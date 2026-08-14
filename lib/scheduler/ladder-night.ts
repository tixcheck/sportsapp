/**
 * Ordering one tier's sets into the slots of its own night. Pure: no DB access.
 *
 * `ladder-split.ts` decides WHO plays whom and how often ("everyone gets 6
 * sets" → each pair twice). This decides the ORDER they're played in, on a
 * single court, and that ordering is what players actually experience:
 *
 *   - Nobody should be made to play four sets back to back.
 *   - Nobody should stand around for 45 minutes between sets.
 *   - The same two teams shouldn't meet twice in a row — it reads as a mistake
 *     even when the pairing legitimately meets twice.
 *   - A tier's top team may arrive late, so it can play nothing in the opening
 *     slots. This is the reward an organizer hands out for finishing top, and
 *     the naive version of it — arrive as late as arithmetically possible — has
 *     them playing every remaining slot with no break at all.
 *
 * Those pull against each other, so this is a search rather than a
 * construction: shuffle, score, keep the best. Seeded, because an organizer who
 * redraws a week must not get a different night.
 */

export type TeamId = string;
export type SetPairing = { homeTeamId: TeamId; awayTeamId: TeamId };

export interface NightOrderInput {
  /** Every set to be played, already expanded (a pair meeting twice = 2). */
  sets: SetPairing[];
  teamIds: TeamId[];
  /**
   * The team arriving late, and how many opening slots it sits out. Omit for a
   * tier where everyone starts together.
   */
  lateTeamId?: TeamId | null;
  lateStartSlots?: number;
  /** Deterministic per week, so redrawing week 3 gives week 3's night back. */
  seed?: number;
}

export interface TeamNight {
  teamId: TeamId;
  /** 0-based slots this team plays. */
  slots: number[];
  /** Longest run of consecutive slots played. */
  maxConsecutive: number;
  /** Longest idle stretch between two of its own sets. */
  longestWait: number;
}

export interface NightOrderResult {
  /** Sets in slot order — index 0 is the first set of the night. */
  order: SetPairing[];
  perTeam: TeamNight[];
  /** Set to true when the late-arrival request could not be honoured. */
  lateStartImpossible: boolean;
  /** How many opening slots the late team actually sits out. */
  lateStartApplied: number;
}

const pairKey = (s: SetPairing) =>
  [s.homeTeamId, s.awayTeamId].sort().join("|");

const involves = (s: SetPairing, t: TeamId) =>
  s.homeTeamId === t || s.awayTeamId === t;

/** Small deterministic PRNG (mulberry32), matching round-robin.ts. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each team's slots, longest run and longest wait, for a given order. */
export function describeNight(
  order: SetPairing[],
  teamIds: TeamId[],
): TeamNight[] {
  return teamIds.map((teamId) => {
    const slots: number[] = [];
    order.forEach((s, i) => {
      if (involves(s, teamId)) slots.push(i);
    });

    let maxConsecutive = 0;
    let run = 0;
    let prev = -2;
    for (const i of slots) {
      run = i === prev + 1 ? run + 1 : 1;
      prev = i;
      maxConsecutive = Math.max(maxConsecutive, run);
    }

    let longestWait = 0;
    for (let k = 1; k < slots.length; k++) {
      longestWait = Math.max(longestWait, slots[k] - slots[k - 1] - 1);
    }

    return { teamId, slots, maxConsecutive, longestWait };
  });
}

/**
 * The most opening slots a tier can hold back one team for.
 *
 * Only sets that DON'T involve them can be played before they arrive, so that
 * count is a hard ceiling. Asking for more is unschedulable, not merely tight —
 * worth saying out loud rather than quietly producing a night where the late
 * team plays before it has arrived.
 */
export function maxLateStartSlots(
  sets: SetPairing[],
  lateTeamId: TeamId,
): number {
  return sets.filter((s) => !involves(s, lateTeamId)).length;
}

/** Lower is better. Weights encode which complaint an organizer hears loudest. */
function scoreOrder(order: SetPairing[], teamIds: TeamId[]): number {
  let rematches = 0;
  for (let i = 1; i < order.length; i++) {
    if (pairKey(order[i]) === pairKey(order[i - 1])) rematches++;
  }

  const nights = describeNight(order, teamIds);
  const maxRun = Math.max(...nights.map((n) => n.maxConsecutive));
  const maxWait = Math.max(...nights.map((n) => n.longestWait));
  const totalWait = nights.reduce((n, t) => n + t.longestWait, 0);

  // A back-to-back rematch looks broken; three-in-a-row is felt in the legs;
  // waiting is merely annoying. totalWait breaks ties between equally-bad
  // extremes in favour of the night that's better for everyone else.
  return rematches * 50 + maxRun * 10 + maxWait * 3 + totalWait;
}

/**
 * Order a tier's sets across its night.
 *
 * Returns the best ordering found. The search is bounded and seeded; for the
 * tier sizes a ladder actually uses (3–8 teams, 6–20 sets) it reaches a night
 * with no rematches and at most two-in-a-row almost immediately.
 */
export function orderTierNight(input: NightOrderInput): NightOrderResult {
  const { sets, teamIds, lateTeamId = null, seed = 1 } = input;
  if (sets.length === 0) {
    return {
      order: [],
      perTeam: describeNight([], teamIds),
      lateStartImpossible: false,
      lateStartApplied: 0,
    };
  }

  const requested = Math.max(0, input.lateStartSlots ?? 0);
  const ceiling = lateTeamId ? maxLateStartSlots(sets, lateTeamId) : 0;
  const lateStart = lateTeamId ? Math.min(requested, ceiling) : 0;
  const lateStartImpossible = Boolean(lateTeamId) && requested > ceiling;

  const rng = mulberry32(seed);
  // Enough to find a clean night at these sizes without stalling a request.
  const ATTEMPTS = 20000;
  // No rematches, nobody past two-in-a-row, nobody waiting more than one slot.
  const IDEAL = 0 * 50 + 2 * 10 + 1 * 3 + teamIds.length;

  let best: { order: SetPairing[]; score: number } | null = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const order = [...sets];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    // Hard rule: the late team plays nothing before it arrives. Enforced by
    // pulling its sets out of the opening slots rather than rejecting the
    // shuffle, so a large lateStart doesn't reject nearly every candidate.
    if (lateTeamId && lateStart > 0) {
      for (let i = 0; i < lateStart; i++) {
        if (!involves(order[i], lateTeamId)) continue;
        const swap = order.findIndex(
          (s, k) => k >= lateStart && !involves(s, lateTeamId),
        );
        if (swap === -1) break; // ceiling already caps this; nothing to trade
        [order[i], order[swap]] = [order[swap], order[i]];
      }
    }

    const score = scoreOrder(order, teamIds);
    if (!best || score < best.score) best = { order, score };
    if (best.score <= IDEAL) break;
  }

  return {
    order: best!.order,
    perTeam: describeNight(best!.order, teamIds),
    lateStartImpossible,
    lateStartApplied: lateStart,
  };
}

// ---------------------------------------------------------------------------
// Referees
// ---------------------------------------------------------------------------

export interface RefAssignInput {
  /** The night in slot order, as returned by `orderTierNight`. */
  order: SetPairing[];
  teamIds: TeamId[];
  /**
   * A team that isn't in the building yet, and the number of opening slots it
   * misses. It cannot referee a game it hasn't arrived for — the constraint
   * that makes this more than "pick anyone who's sitting".
   */
  lateTeamId?: TeamId | null;
  lateStartSlots?: number;
}

export interface RefAssignment {
  /** Referee per slot, aligned with `order`. Null when nobody is free. */
  refs: (TeamId | null)[];
  /** How many games each team referees. */
  countByTeam: Record<TeamId, number>;
  /** Slots with no available referee — always empty for a 3+ team tier. */
  uncovered: number[];
}

/**
 * Give every game a referee drawn from the teams sitting that slot.
 *
 * Two rules the organizer set, and one the arithmetic sets:
 *
 *   - Only a team that is SITTING can referee. It can't play and officiate at
 *     once.
 *   - Only a team that has ARRIVED can referee. The tier's late-starting top
 *     team is absent for the opening slots, so those games have to be covered
 *     by the teams already there.
 *   - The load is spread as evenly as the first two rules allow. It will not
 *     come out equal: a team absent for a third of the night is sitting-and-
 *     present far less often than the others, so it referees less. That is a
 *     consequence of the late start, not a flaw in the sharing.
 *
 * Ties break towards whoever refereed longest ago, so duty rotates rather than
 * landing on the same team twice in a row; then on team id, so a redraw of the
 * same night gives the same officials.
 */
export function assignNightRefs(input: RefAssignInput): RefAssignment {
  const { order, teamIds, lateTeamId = null } = input;
  const lateStart = Math.max(0, input.lateStartSlots ?? 0);

  const refs: (TeamId | null)[] = [];
  const uncovered: number[] = [];
  const count: Record<TeamId, number> = Object.fromEntries(
    teamIds.map((t) => [t, 0]),
  );
  const lastRefSlot: Record<TeamId, number> = Object.fromEntries(
    teamIds.map((t) => [t, -1]),
  );

  order.forEach((set, slot) => {
    const present = (t: TeamId) =>
      !(lateTeamId && t === lateTeamId && slot < lateStart);

    const candidates = teamIds.filter(
      (t) => t !== set.homeTeamId && t !== set.awayTeamId && present(t),
    );

    if (candidates.length === 0) {
      refs.push(null);
      uncovered.push(slot);
      return;
    }

    candidates.sort(
      (a, b) =>
        count[a] - count[b] ||
        lastRefSlot[a] - lastRefSlot[b] ||
        a.localeCompare(b),
    );
    const chosen = candidates[0];
    refs.push(chosen);
    count[chosen] += 1;
    lastRefSlot[chosen] = slot;
  });

  return { refs, countByTeam: count, uncovered };
}

/**
 * Whether a tier ever gives its teams a genuine break.
 *
 * With three teams on one court exactly one team sits each slot, so it must
 * referee every time — a team is playing or officiating for the whole night,
 * never idle. Worth surfacing rather than discovering courtside.
 */
export function everyoneAlwaysBusy(teamCount: number): boolean {
  return teamCount <= 3;
}
