/**
 * Choosing which gym each division plays in, and when.
 *
 * Slice two taught the generator to RESPECT a division's venue. This chooses
 * it. Pure — no DB access — so the packing and the fairness rules can be tested
 * without a fixture, which matters because the fairness half is the part a
 * spreadsheet cannot do at all.
 *
 * The shape of the problem, taken from how these leagues actually run: a
 * division occupies a fixed number of courts for a RUN OF CONSECUTIVE SLOTS at
 * ONE venue, then leaves. So each venue is a grid of `courts × slots` and each
 * division is a rectangle that has to sit inside one grid without overlapping
 * another. That's 2-D bin packing, with two twists that matter more than
 * optimal packing does:
 *
 *   1. **Fairness across rounds.** Somebody always draws the late block — with
 *      more divisions than early slots it is arithmetically unavoidable. What
 *      you can control is WHO, round after round. `lateness` carries that
 *      history in, and the divisions who have been burned before get first call
 *      on the early slots.
 *
 *   2. **Changeover smoothing.** If every gym turns over at the same moment,
 *      the whole league moves at once. Spreading the boundaries costs nothing
 *      and no hand-built schedule does it reliably.
 *
 * `courtsNeeded` is an input, not `teams / 2`. A division does not necessarily
 * play every team every slot — BVL's D2 runs 8 teams across 2 courts, so half
 * the division sits each round. Deriving it here would bake in an assumption
 * that is wrong for a real division in the real data.
 */

export type VenueCapacity = {
  venueId: string;
  name?: string;
  /** Games this venue can run at once. */
  courts: number;
  /** Time slots available at this venue for the night. */
  slots: number;
};

export type DivisionNeed = {
  divisionId: string;
  name?: string;
  /** Courts occupied simultaneously while this division is playing. */
  courtsNeeded: number;
  /** Consecutive slots it needs. */
  rounds: number;
  /** Teams — used only to weigh how many people a changeover moves. */
  teams?: number;
};

export type Placement = {
  divisionId: string;
  venueId: string;
  /** 0-based slot index at that venue where the division's block starts. */
  startSlot: number;
  courtsNeeded: number;
  rounds: number;
};

export type Unplaced = { divisionId: string; reason: string };

export type AssignmentResult = {
  placements: Placement[];
  unplaced: Unplaced[];
  /** Teams entering or leaving at each slot boundary, worst first. */
  changeovers: { slot: number; teamsMoving: number }[];
  /** Courts left idle, as a fraction of the whole night's capacity. */
  idleFraction: number;
};

export type AssignOptions = {
  /**
   * How badly each division has been treated in earlier rounds — higher means
   * later blocks, so it gets stronger preference for an early slot now. Any
   * scale works; only the relative order matters.
   */
  lateness?: Record<string, number>;
};

/** A late slot hurts more the more a division has already suffered. */
const LATENESS_WEIGHT = 10;
/** Baseline nudge towards earlier slots, so ties don't drift late. */
const BASE_SLOT_COST = 1;
/** Cost of piling another division's block boundary onto a shared moment. */
const CHANGEOVER_WEIGHT = 4;
/** Prefer a gym the division fills neatly over one it rattles around in. */
const WASTE_WEIGHT = 2;

/**
 * Place every division into a venue and a starting slot.
 *
 * Divisions are placed in order of what they're OWED first, then largest-first
 * (best-fit-decreasing) — see the comment on the sort. Every tie breaks on
 * division id, so the same inputs always give the same schedule: an organizer
 * regenerating a week must not get a different answer.
 */
export function assignDivisionsToVenues(
  divisions: DivisionNeed[],
  venues: VenueCapacity[],
  opts: AssignOptions = {},
): AssignmentResult {
  const lateness = opts.lateness ?? {};

  // used[venueId][slot] = courts already committed at that instant.
  const used = new Map<string, number[]>();
  for (const v of venues) {
    used.set(v.venueId, new Array(Math.max(0, v.slots)).fill(0));
  }
  // How many block boundaries already land on each slot index, across all
  // venues — the changeover load we're trying to spread.
  const boundaryLoad = new Map<number, number>();

  /*
   * Order matters more than the cost function does.
   *
   * Whoever is placed first takes the best slot, so weighting lateness only
   * inside a division's own choice achieves nothing — the first division still
   * grabs slot 0 every round and the rotation never happens. Lateness
   * therefore leads the sort: the division owed an early slot picks first.
   *
   * Size breaks the tie, which is best-fit-decreasing and the right packing
   * order. With no history (every lateness 0) that is exactly what this
   * degrades to.
   */
  const order = [...divisions].sort(
    (a, b) =>
      (lateness[b.divisionId] ?? 0) - (lateness[a.divisionId] ?? 0) ||
      b.courtsNeeded * b.rounds - a.courtsNeeded * a.rounds ||
      b.courtsNeeded - a.courtsNeeded ||
      a.divisionId.localeCompare(b.divisionId),
  );

  const placements: Placement[] = [];
  const unplaced: Unplaced[] = [];

  for (const d of order) {
    if (d.courtsNeeded <= 0 || d.rounds <= 0) {
      unplaced.push({
        divisionId: d.divisionId,
        reason: "Needs no courts or no rounds.",
      });
      continue;
    }

    let best: { venueId: string; startSlot: number; cost: number } | null =
      null;
    let sawBigEnoughVenue = false;

    for (const v of venues) {
      if (v.courts < d.courtsNeeded || v.slots < d.rounds) continue;
      sawBigEnoughVenue = true;
      const timeline = used.get(v.venueId)!;

      /*
       * Only start where a block can start: the top of the night, or the moment
       * the gym frees up.
       *
       * Letting a block begin anywhere strands capacity. A 3-round division
       * dropped at slot 1 of a 6-slot gym leaves a 1-slot gap before it and a
       * 2-slot gap after — neither long enough for another 3-round division, so
       * a gym that should hold two divisions holds one. Against BVL's real
       * shape that left two divisions with nowhere to go while five gyms sat
       * half empty; the changeover smoothing below was quietly causing it by
       * nudging blocks off alignment.
       */
      const anchors = new Set<number>([0]);
      for (let i = 1; i < v.slots; i++) {
        if (timeline[i] !== timeline[i - 1]) anchors.add(i);
      }

      for (const s of [...anchors].sort((a, b) => a - b)) {
        if (s + d.rounds > v.slots) continue;
        let fits = true;
        for (let i = s; i < s + d.rounds; i++) {
          if (timeline[i] + d.courtsNeeded > v.courts) {
            fits = false;
            break;
          }
        }
        if (!fits) continue;

        // Fairness: a division owed an early slot pays more for a late one.
        const latePenalty =
          s *
          (BASE_SLOT_COST + LATENESS_WEIGHT * (lateness[d.divisionId] ?? 0));
        // Smoothing: both ends of the block are moments the gym changes over.
        const changeover =
          CHANGEOVER_WEIGHT *
          ((boundaryLoad.get(s) ?? 0) + (boundaryLoad.get(s + d.rounds) ?? 0));
        // Packing: prefer the gym this division fills most neatly.
        const waste = WASTE_WEIGHT * (v.courts - d.courtsNeeded);

        const cost = latePenalty + changeover + waste;
        if (
          !best ||
          cost < best.cost ||
          // Deterministic tie-break, so regeneration is stable.
          (cost === best.cost &&
            (v.venueId < best.venueId ||
              (v.venueId === best.venueId && s < best.startSlot)))
        ) {
          best = { venueId: v.venueId, startSlot: s, cost };
        }
      }
    }

    if (!best) {
      unplaced.push({
        divisionId: d.divisionId,
        reason: sawBigEnoughVenue
          ? `No venue has ${d.courtsNeeded} court${d.courtsNeeded === 1 ? "" : "s"} free for ${d.rounds} slots in a row.`
          : `No venue is big enough — needs ${d.courtsNeeded} court${d.courtsNeeded === 1 ? "" : "s"} for ${d.rounds} slots.`,
      });
      continue;
    }

    const timeline = used.get(best.venueId)!;
    for (let i = best.startSlot; i < best.startSlot + d.rounds; i++) {
      timeline[i] += d.courtsNeeded;
    }
    boundaryLoad.set(
      best.startSlot,
      (boundaryLoad.get(best.startSlot) ?? 0) + 1,
    );
    boundaryLoad.set(
      best.startSlot + d.rounds,
      (boundaryLoad.get(best.startSlot + d.rounds) ?? 0) + 1,
    );

    placements.push({
      divisionId: d.divisionId,
      venueId: best.venueId,
      startSlot: best.startSlot,
      courtsNeeded: d.courtsNeeded,
      rounds: d.rounds,
    });
  }

  return {
    placements: [...placements].sort(
      (a, b) =>
        a.venueId.localeCompare(b.venueId) ||
        a.startSlot - b.startSlot ||
        a.divisionId.localeCompare(b.divisionId),
    ),
    unplaced,
    changeovers: changeoverLoad(placements, divisions),
    idleFraction: idleFraction(placements, venues),
  };
}

/**
 * Teams entering or leaving at each slot boundary.
 *
 * The number an organizer actually feels: how many people move at once. A
 * division's start and end are both boundaries; the opening slot isn't counted,
 * because everybody arriving at the start of the night is just the night
 * starting.
 */
export function changeoverLoad(
  placements: Placement[],
  divisions: DivisionNeed[],
): { slot: number; teamsMoving: number }[] {
  const teamsOf = new Map(
    divisions.map((d) => [d.divisionId, d.teams ?? d.courtsNeeded * 2]),
  );
  const load = new Map<number, number>();
  for (const p of placements) {
    const teams = teamsOf.get(p.divisionId) ?? 0;
    if (p.startSlot > 0) {
      load.set(p.startSlot, (load.get(p.startSlot) ?? 0) + teams);
    }
    const end = p.startSlot + p.rounds;
    load.set(end, (load.get(end) ?? 0) + teams);
  }
  return [...load.entries()]
    .map(([slot, teamsMoving]) => ({ slot, teamsMoving }))
    .sort((a, b) => b.teamsMoving - a.teamsMoving || a.slot - b.slot);
}

/**
 * Work out what each division is owed from the schedule it has already played.
 *
 * For every night, divisions are ranked by when their first game starts; that
 * rank is the debt. A division that keeps drawing the last block accumulates,
 * and outranks everyone for the early slot next round.
 *
 * This is the bit no spreadsheet does. Over a season the drift is invisible
 * week to week and obvious in aggregate — and by then it's a captain
 * complaining, not a number anyone can see.
 */
export function latenessFromHistory(
  games: { date: string; divisionId: string; startMinutes: number }[],
): Record<string, number> {
  const byNight = new Map<string, Map<string, number>>();
  for (const g of games) {
    let night = byNight.get(g.date);
    if (!night) {
      night = new Map();
      byNight.set(g.date, night);
    }
    const prev = night.get(g.divisionId);
    if (prev == null || g.startMinutes < prev) {
      night.set(g.divisionId, g.startMinutes);
    }
  }

  const lateness: Record<string, number> = {};
  for (const night of byNight.values()) {
    const ranked = [...night.entries()].sort((a, b) => a[1] - b[1]);
    // Divisions sharing a start time share a rank — they were treated equally.
    let rank = 0;
    for (let i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i][1] !== ranked[i - 1][1]) rank = i;
      lateness[ranked[i][0]] = (lateness[ranked[i][0]] ?? 0) + rank;
    }
  }
  return lateness;
}

/** Share of the night's court-slots left empty. 0 = perfectly packed. */
function idleFraction(
  placements: Placement[],
  venues: VenueCapacity[],
): number {
  const total = venues.reduce(
    (n, v) => n + Math.max(0, v.courts) * Math.max(0, v.slots),
    0,
  );
  if (total === 0) return 0;
  const filled = placements.reduce((n, p) => n + p.courtsNeeded * p.rounds, 0);
  return Math.max(0, 1 - filled / total);
}

/**
 * How late each division played, from a set of placements — the input to the
 * NEXT round's fairness.
 *
 * Carried forward rather than recomputed from scratch so lateness accumulates
 * across a season: the division that drew the late block in round 5 outranks
 * everyone for an early slot in round 6, and having got one, drops back down.
 */
export function latenessAfter(
  placements: Placement[],
  previous: Record<string, number> = {},
): Record<string, number> {
  const next: Record<string, number> = { ...previous };
  for (const p of placements) {
    // A block starting at slot 0 is the reward: it pays down what's owed.
    next[p.divisionId] = Math.max(
      0,
      (previous[p.divisionId] ?? 0) + (p.startSlot > 0 ? p.startSlot : -1),
    );
  }
  return next;
}
