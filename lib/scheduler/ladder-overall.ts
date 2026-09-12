/**
 * Ladder standings by OVERALL POSITION — golf scoring.
 *
 * Scarborough Men's rank the whole league, not each gym. A team's score for a
 * night is where they finished among all 40 teams: first in the top tier is 1,
 * last in the bottom tier is 40. Season total is the sum, and the LOWEST total
 * is the top seed. Their organizer: "first in tier 1 gets 1 pt, last in last
 * tier gets 40 … then we just total and lowest scores are top seeds."
 *
 * Lower-is-better is the whole point and the easiest thing to get backwards, so
 * it is stated in the types and asserted in the tests rather than left to a
 * comparator somebody might later "fix".
 *
 * This is NOT the weighting added in migration 0115. That one is Mango's rule —
 * points for being in a tier plus more per set won, higher being better. Two
 * organizations, two incompatible schemes, so they live apart rather than
 * behind a flag that would make each look like a variant of the other.
 *
 * Pure: no DB, no clock.
 */

export interface NightPlacement {
  teamId: string;
  /** 0 = the top tier. */
  tierIndex: number;
  /** 1 = won the gym that night. */
  rankInTier: number;
}

export interface OverallStanding {
  teamId: string;
  /** Sum of overall positions across the nights they were placed. */
  total: number;
  nights: number;
  /** Lowest total first; 1 = top seed. */
  seed: number;
  /** Every night's position, in the order supplied. */
  positions: number[];
}

/**
 * Where a finishing place sits in the league as a whole.
 *
 * Everyone in a tier above you outranks you whatever they did, so the tiers
 * above contribute their full size and the rank within the tier does the rest.
 * Tier 0 rank 1 is position 1; with sizes [6,4,4,6,6,4,4,6], tier 7 rank 6 is
 * position 40.
 */
export function overallPosition(
  tierIndex: number,
  rankInTier: number,
  tierSizes: number[],
): number {
  const above = tierSizes.slice(0, tierIndex).reduce((a, b) => a + b, 0);
  return above + rankInTier;
}

/**
 * Season standings from every night's placements.
 *
 * A team is scored only for nights it appears in. Whether a missed night
 * should cost a team anything is a league rule nobody has stated — counting it
 * as zero would make absence the best possible result, and counting it as last
 * would punish a team the organizer may have excused — so it is left out of
 * both the total and the night count, and `nights` is reported so a reader can
 * see the totals are not over the same number of weeks.
 *
 * Ties keep their shared seed, and the next seed skips accordingly: two teams
 * tied on 14 are both 3rd and the next is 5th. Their tiebreak is unstated, and
 * inventing one would quietly decide a playoff place.
 */
export function overallStandings(
  nights: NightPlacement[][],
  tierSizes: number[],
): OverallStanding[] {
  const byTeam = new Map<string, number[]>();

  for (const night of nights) {
    for (const p of night) {
      const position = overallPosition(p.tierIndex, p.rankInTier, tierSizes);
      const list = byTeam.get(p.teamId);
      if (list) list.push(position);
      else byTeam.set(p.teamId, [position]);
    }
  }

  const rows = [...byTeam.entries()]
    .map(([teamId, positions]) => ({
      teamId,
      positions,
      nights: positions.length,
      total: positions.reduce((a, b) => a + b, 0),
      seed: 0,
    }))
    // Lowest total leads. Team id breaks the display order only, so the list is
    // stable run to run — it is not a tiebreak and does not change `seed`.
    .sort((a, b) => a.total - b.total || a.teamId.localeCompare(b.teamId));

  let seed = 0;
  let lastTotal: number | null = null;
  rows.forEach((row, i) => {
    if (lastTotal === null || row.total !== lastTotal) seed = i + 1;
    row.seed = seed;
    lastTotal = row.total;
  });

  return rows;
}

/**
 * The best and worst position obtainable, for a sanity check on a setup.
 *
 * With Scarborough's eight tiers this is 1 and 40, which is exactly how their
 * organizer described the scheme — a quick way to catch a tier list that has
 * drifted out of step with the teams actually in it.
 */
export function positionRange(tierSizes: number[]): {
  best: number;
  worst: number;
} {
  const worst = tierSizes.reduce((a, b) => a + b, 0);
  return { best: worst > 0 ? 1 : 0, worst };
}
