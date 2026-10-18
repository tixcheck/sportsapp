/**
 * Brampton Volleyball League's ROUND format — a ladder whose cycle is two
 * playing weeks, not one.
 *
 * BVL (2026-10-07): "They do one round in two weeks. Every team in the tier
 * plays against each other and then after that they are moved up and down and
 * then another round is generated." Transcribed from their own sheet, "Women
 * Only Wednesdays - Round 1" (Oct 14 / Oct 21): teams are numbered within
 * their tier (1 = top seat coming in), each tier plays a fixed grid on courts
 * a/b/c, week 1 of a round uses grid A and week 2 grid B, and together they
 * are the tier's round robin. After the round the ladder locks on BOTH weeks'
 * results and teams move.
 *
 * As with SMVA's pods, nothing here is computed in the scheduling sense —
 * the grids are BVL's, written down. The only work is binding numbers to the
 * tier's seated teams and the slot rows to the times the gym gives that tier
 * that week (which differ: 40-minute slots in a full permit, 25–35 in a
 * 1 h 45 "half school" one — so times come from the weekly gym plan, not the
 * grid).
 *
 * Pure: no DB, no clock.
 */

export type BvlGame = { home: number; away: number };

export interface BvlWeekGrid {
  /** One row per time slot; one game per court, in court order. */
  slots: BvlGame[][];
  /** Team numbers sitting out each slot (5-team tiers), else empty. */
  off: number[];
  /** Team numbers on net duty that night, as the sheet's NETS column. */
  nets: number[];
}

export interface BvlTemplate {
  teams: number;
  courts: number;
  /** Week 1 of the round, then week 2. */
  weeks: [BvlWeekGrid, BvlWeekGrid];
  /** The sheet's scoring note for this size of tier, if it has one. */
  scoring: string | null;
  /**
   * Pairings played in BOTH weeks as ONE game each — the sheet's red cells.
   * BVL: "RED - Means you only play 1 match - Higher rank team gets serve the
   * 1st week. 2nd Team gets serve the second week." Theresa, 2026-10-10:
   * "The 2 week will make one" — the two single games are one match.
   */
  halfPairs: [number, number][];
}

const g = (pair: string): BvlGame => {
  const [home, away] = pair.split("v").map(Number);
  return { home, away };
};
const row = (...pairs: string[]) => pairs.map(g);

/**
 * 6 teams, 3 courts, 3 games each a night. Week A and week B between them hold
 * all fifteen pairings; 3v5, 2v6 and 1v4 are played in both — but as ONE game
 * each week, the two together making the match (red on their sheet), so each
 * team plays all five opponents once.
 */
const BVL_6: BvlTemplate = {
  teams: 6,
  courts: 3,
  weeks: [
    {
      slots: [
        row("1v6", "4v5", "2v3"),
        row("1v3", "4v6", "2v5"),
        row("3v5", "2v6", "1v4"),
      ],
      off: [],
      nets: [6, 4, 3],
    },
    {
      slots: [
        row("3v5", "2v6", "1v4"),
        row("2v4", "1v5", "3v6"),
        row("1v2", "3v4", "5v6"),
      ],
      off: [],
      nets: [5, 2, 1],
    },
  ],
  scoring: null,
  halfPairs: [
    [1, 4],
    [2, 6],
    [3, 5],
  ],
};

/**
 * 5 teams, 2 courts, one team OFF each slot: every week is a full round robin
 * (4 games each), so the round is a double round robin. Order from Terry
 * Miller's columns on Oct 14 and Oct 21.
 */
const BVL_5: BvlTemplate = {
  teams: 5,
  courts: 2,
  weeks: [
    {
      slots: [
        row("1v2", "3v4"),
        row("1v3", "2v5"),
        row("1v5", "2v4"),
        row("4v5", "2v3"),
        row("1v4", "3v5"),
      ],
      off: [5, 4, 3, 1, 2],
      nets: [],
    },
    {
      slots: [
        row("4v5", "2v3"),
        row("1v2", "3v4"),
        row("1v5", "2v4"),
        row("1v4", "3v5"),
        row("1v3", "2v5"),
      ],
      off: [1, 5, 3, 2, 4],
      nets: [],
    },
  ],
  scoring: null,
  halfPairs: [],
};

/**
 * 4 teams, 2 courts — the sheet's "Division of 4s". Every pairing once a week.
 * "If you have this they start at 4-4."
 */
const BVL_4: BvlTemplate = {
  teams: 4,
  courts: 2,
  weeks: [
    {
      slots: [row("1v4", "2v3"), row("2v4", "1v3"), row("1v2", "3v4")],
      off: [],
      nets: [],
    },
    {
      slots: [row("1v4", "2v3"), row("2v4", "1v3"), row("1v2", "3v4")],
      off: [],
      nets: [],
    },
  ],
  scoring: "Games start at 4-4",
  halfPairs: [],
};

const TEMPLATES = new Map(
  [4, 5, 6].map((n) => [n, [BVL_4, BVL_5, BVL_6][n - 4]]),
);

/**
 * 6 teams who play everyone ONCE over the round — BVL Reverse 4s (Indru,
 * 2026-10-10): "6 team tier will play all other teams once (one double, one
 * triple)". The fifteen pairings in five slots (a standard rotation, team 1
 * fixed), three slots in week 1 and two in week 2, as his Round 1 sheet sets
 * the gyms. No red halves: every game is a full match.
 */
const BVL_6_ONCE: BvlTemplate = {
  teams: 6,
  courts: 3,
  weeks: [
    {
      slots: [
        row("1v6", "2v5", "3v4"),
        row("1v5", "4v6", "2v3"),
        row("1v4", "3v5", "2v6"),
      ],
      off: [],
      nets: [],
    },
    {
      slots: [row("1v3", "2v4", "5v6"), row("1v2", "3v6", "4v5")],
      off: [],
      nets: [],
    },
  ],
  scoring: null,
  halfPairs: [],
};

/**
 * Which grids a league plays (`league_settings.ladder_round_grid`, 0163):
 * "bvl" — the Women's sheet (6-team tiers play 18 games with red halves);
 * "once" — 6-team tiers play everyone once, 3 slots then 2 (Reverse 4s);
 * "cycle" — Non-Spiking (0174): a fixed rotation played straight through the
 *   round, as many rotation rounds a night as the gym's slot times allow.
 * 4- and 5-team tiers are the same for "bvl" and "once".
 */
export type BvlGridStyle = "bvl" | "once" | "cycle";

/**
 * The rotations "cycle" plays, one row per round, one game per court.
 *
 * BVL Non-Spiking (Indru, 2026-10-18): a four-week round whose gyms give each
 * tier 2 or 3 rounds a night, so no two-week grid fits. A 6-team tier plays
 * the standard rotation (team 1 fixed) — every 5 rounds a full round robin.
 * A 7-team tier plays Indru's own table from his Round 1 sheet: 3 courts, one
 * team sitting out each round, every 7 rounds a full round robin.
 */
const CYCLES: Record<number, BvlGame[][]> = {
  6: [
    row("1v6", "2v5", "3v4"),
    row("1v5", "4v6", "2v3"),
    row("1v4", "3v5", "2v6"),
    row("1v3", "2v4", "5v6"),
    row("1v2", "3v6", "4v5"),
  ],
  7: [
    row("1v7", "2v6", "3v5"),
    row("2v1", "3v7", "4v6"),
    row("3v2", "4v1", "5v7"),
    row("4v3", "5v2", "6v1"),
    row("5v4", "6v3", "7v2"),
    row("6v5", "7v4", "1v3"),
    row("7v6", "1v5", "2v4"),
  ],
};

/** `ladder_round_grid` as stored → the style; anything unknown is "bvl". */
export function gridStyleOf(value: unknown): BvlGridStyle {
  return value === "once" || value === "cycle" ? value : "bvl";
}

/** The rotation a "cycle" tier of this size plays, or null if there is none. */
export function bvlCycle(teams: number): BvlGame[][] | null {
  return CYCLES[teams] ?? null;
}

export function bvlTemplate(
  teams: number,
  style: BvlGridStyle = "bvl",
): BvlTemplate | null {
  // A "cycle" tier has no two-week grid (and no net duty): see bvlCycle.
  if (style === "cycle") return null;
  if (style === "once" && teams === 6) return BVL_6_ONCE;
  return TEMPLATES.get(teams) ?? null;
}

/** Weeks of the round a week belongs to, rounds counted from week 1. */
export function roundWeeksOf(week: number, roundLength: number): number[] {
  const len = Math.max(1, roundLength);
  const start = week - ((week - 1) % len);
  return Array.from({ length: len }, (_, i) => start + i);
}

export interface BvlTierWeek {
  divisionId: string;
  /** Seated order for the round: index 0 is team 1. */
  teamIds: string[];
  venueId: string | null;
  /** "HH:MM" for each slot of the grid, in order. */
  slotTimes: string[];
  /** Court labels, in grid court order. Default a, b, c. */
  courtLabels?: string[];
}

export interface BvlFixture {
  divisionId: string;
  venueId: string | null;
  week: number;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  court: string;
  slotIndex: number;
  time: string;
  /** One game of a two-week match (red on BVL's sheet) — see `halfPairs`. */
  half: boolean;
}

export interface BvlRoundPlan {
  fixtures: BvlFixture[];
  /** Tier → teams on net duty, per week. */
  nets: { week: number; divisionId: string; teamIds: string[] }[];
  problems: { week: number; divisionId: string; reason: string }[];
}

/**
 * Bind a round: for each week of it (in order — week 1 takes grid A, week 2
 * grid B), each tier's teams onto its grid at the times its gym gives it that
 * week. Anything that can't be bound — no grid for that many teams, fewer
 * slot times or courts than the grid needs — is reported, never guessed.
 */
export function planBvlRound(
  weeks: { week: number; date: string; tiers: BvlTierWeek[] }[],
  style: BvlGridStyle = "bvl",
): BvlRoundPlan {
  const fixtures: BvlFixture[] = [];
  const nets: BvlRoundPlan["nets"] = [];
  const problems: BvlRoundPlan["problems"] = [];

  if (style === "cycle") return planCycleRound(weeks);

  weeks.forEach((w, weekIndex) => {
    for (const tier of w.tiers) {
      const t = bvlTemplate(tier.teamIds.length, style);
      if (!t) {
        problems.push({
          week: w.week,
          divisionId: tier.divisionId,
          reason: `${tier.teamIds.length} teams — BVL's grids are for 4, 5 or 6`,
        });
        continue;
      }
      const grid = t.weeks[weekIndex % 2];
      const courts = tier.courtLabels ?? ["a", "b", "c"].slice(0, t.courts);
      if (tier.slotTimes.length < grid.slots.length) {
        problems.push({
          week: w.week,
          divisionId: tier.divisionId,
          reason: `needs ${grid.slots.length} slot times, has ${tier.slotTimes.length}`,
        });
        continue;
      }
      if (courts.length < t.courts) {
        problems.push({
          week: w.week,
          divisionId: tier.divisionId,
          reason: `needs ${t.courts} courts, has ${courts.length}`,
        });
        continue;
      }
      const team = (n: number) => tier.teamIds[n - 1];
      const isHalf = (a: number, b: number) =>
        t.halfPairs.some(
          ([x, y]) => (x === a && y === b) || (x === b && y === a),
        );
      grid.slots.forEach((games, slotIndex) =>
        games.forEach((game, c) =>
          fixtures.push({
            divisionId: tier.divisionId,
            venueId: tier.venueId,
            week: w.week,
            date: w.date,
            homeTeamId: team(game.home),
            awayTeamId: team(game.away),
            court: courts[c],
            slotIndex,
            time: tier.slotTimes[slotIndex],
            half: isHalf(game.home, game.away),
          }),
        ),
      );
      if (grid.nets.length > 0) {
        nets.push({
          week: w.week,
          divisionId: tier.divisionId,
          teamIds: grid.nets.map(team),
        });
      }
    }
  });
  return { fixtures, nets, problems };
}

/**
 * "cycle": each tier walks its rotation from round 1, taking one rotation round
 * per slot time its gym gives it that week, carrying on where the last week
 * stopped. So a tier with 3 + 2 + 3 + 2 slots over a four-week round plays
 * rotation rounds 1–3, 4–5, 6–8 (6 = 1 again for 6 teams), 9–10.
 */
function planCycleRound(
  weeks: { week: number; date: string; tiers: BvlTierWeek[] }[],
): BvlRoundPlan {
  const fixtures: BvlFixture[] = [];
  const problems: BvlRoundPlan["problems"] = [];
  const next = new Map<string, number>();
  for (const w of weeks) {
    for (const tier of w.tiers) {
      const cycle = bvlCycle(tier.teamIds.length);
      if (!cycle) {
        problems.push({
          week: w.week,
          divisionId: tier.divisionId,
          reason: `${tier.teamIds.length} teams — the rotations are for 6 or 7`,
        });
        continue;
      }
      if (tier.slotTimes.length === 0) {
        problems.push({
          week: w.week,
          divisionId: tier.divisionId,
          reason: "no slot times for this week",
        });
        continue;
      }
      const courts = tier.courtLabels ?? ["a", "b", "c"];
      if (courts.length < cycle[0].length) {
        problems.push({
          week: w.week,
          divisionId: tier.divisionId,
          reason: `needs ${cycle[0].length} courts, has ${courts.length}`,
        });
        continue;
      }
      tier.slotTimes.forEach((time, slotIndex) => {
        const i = next.get(tier.divisionId) ?? 0;
        next.set(tier.divisionId, i + 1);
        cycle[i % cycle.length].forEach((game, c) =>
          fixtures.push({
            divisionId: tier.divisionId,
            venueId: tier.venueId,
            week: w.week,
            date: w.date,
            homeTeamId: tier.teamIds[game.home - 1],
            awayTeamId: tier.teamIds[game.away - 1],
            court: courts[c],
            slotIndex,
            time,
            half: false,
          }),
        );
      });
    }
  }
  return { fixtures, nets: [], problems };
}

/** Evenly spaced slot times: "18:15", 40, 3 → 18:15, 18:55, 19:35. */
export function evenSlotTimes(
  start: string,
  minutes: number,
  count: number,
): string[] {
  const [h, m] = start.split(":").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const t = h * 60 + m + i * minutes;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  });
}

/** A result the lock ranks on, as `rankLadderNight` takes it. */
export interface RoundResult {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  sets: { home: number; away: number }[];
  /** One game of a two-week match. */
  half: boolean;
}

/**
 * Join each two-week match's halves into one result before ranking a round.
 *
 * Theresa (BVL), 2026-10-10: "The 2 week will make one." A red pairing plays
 * one game in each week; ranked separately they would be two 1–0 results, so a
 * team that split them would bank a win AND a loss where BVL counts one tied
 * match. Together they are the match: 2–0 is a win, 1–1 a tie. The second
 * half's sets are turned to the first half's home/away, since who is "home"
 * can differ between the weeks. A half whose partner isn't there yet (week 2
 * not played) stays on its own.
 */
export function combineHalves(results: RoundResult[]): RoundResult[] {
  const out: RoundResult[] = [];
  const open = new Map<string, RoundResult>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const r of results) {
    if (!r.half) {
      out.push(r);
      continue;
    }
    const k = key(r.homeTeamId, r.awayTeamId);
    const first = open.get(k);
    if (!first) {
      const copy = { ...r, sets: [...r.sets] };
      open.set(k, copy);
      out.push(copy);
      continue;
    }
    const flipped = first.homeTeamId !== r.homeTeamId;
    first.sets.push(
      ...r.sets.map((x) => (flipped ? { home: x.away, away: x.home } : x)),
    );
    open.delete(k);
  }
  return out;
}
