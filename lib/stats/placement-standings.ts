/**
 * Standings scored by where you finished, not by what you won.
 *
 * Mango's Fall season, in the organizer's words: "Top team will get 1, 18th
 * team will get 18. The more the points the lower they end up." Each night a
 * team scores its TIER'S NUMBER plus its finishing position — the winner of
 * Tier 1 scores 1, third in Tier 1 scores 3, the winner of Tier 2 scores 4, and
 * so on to 18 at the bottom of Tier 6. Add the nights up; lowest wins.
 *
 * This is the mirror of `weighted-standings.ts`, not a variant of it. There a
 * team EARNS points and the highest total tops the table; here a low score is
 * the good one, so sets won are worth nothing and the sort runs the other way.
 * The two cannot be merged by choosing different numbers — winning more sets
 * would raise a total that is supposed to fall.
 *
 * Pure: no DB.
 *
 * ── Two things worth knowing ──────────────────────────────────────────────
 *
 * MISSING A NIGHT LOWERS YOUR TOTAL, which under this scheme reads as doing
 * better. That is inherent to summing a "low is good" score, not a bug here. It
 * does not bite Mango — all 18 teams play every week — so the totals are summed
 * as the organizer described rather than averaged behind their back. A team on
 * the same total from MORE nights is ranked higher, which is the least this can
 * do about it; if absences ever become normal, average-per-night is the fix.
 *
 * TIER NUMBERS MUST LEAVE ROOM FOR THE TIER'S SIZE. With 3 teams a tier, bases
 * of 1, 4, 7, 10, 13, 16 give a clean 1–18. A tier that grows to 4 teams would
 * score 1–4 and collide with the next tier's 4. The bases are the organizer's
 * to set, and nothing here renumbers them.
 */

export type PlacementTier = {
  divisionId: string;
  name: string;
  /** What the team finishing FIRST in this tier scores that night. */
  base: number;
};

export type WeekFinish = {
  teamId: string;
  week: number;
  divisionId: string;
  /**
   * Where they finished in their tier that night, 1 = won it. Null when the
   * night has no result yet — those weeks are skipped, never scored as zero,
   * which would read as a perfect night.
   */
  rank: number | null;
};

export type PlacementWeek = {
  week: number;
  divisionId: string;
  tierName: string;
  rank: number;
  /** base + (rank − 1). */
  score: number;
};

export type PlacementRow = {
  teamId: string;
  /** Newest week first, matching the weighted table. */
  weeks: PlacementWeek[];
  totalScore: number;
  weeksPlayed: number;
  /** Their best single night (lowest score), or null if they have none. */
  bestWeek: number | null;
};

/** One team-night: the tier's number, plus how far down the tier they came. */
export function weekScore(
  finish: WeekFinish & { rank: number },
  tier: PlacementTier,
): PlacementWeek {
  return {
    week: finish.week,
    divisionId: finish.divisionId,
    tierName: tier.name,
    rank: finish.rank,
    score: tier.base + (finish.rank - 1),
  };
}

/**
 * The placement table, LOWEST first.
 *
 * Finishes in a tier with no number configured are skipped rather than counted
 * as zero — zero would be a better night than winning Tier 1, which is the one
 * result this must never invent. Same rule as the weighted table's unpriced
 * tiers, for the same reason.
 */
export function placementStandings(
  finishes: WeekFinish[],
  tiers: PlacementTier[],
): PlacementRow[] {
  const byDivision = new Map(tiers.map((t) => [t.divisionId, t]));
  const byTeam = new Map<string, PlacementWeek[]>();

  for (const f of finishes) {
    if (f.rank === null || f.rank < 1) continue;
    const tier = byDivision.get(f.divisionId);
    if (!tier) continue;
    const list = byTeam.get(f.teamId) ?? [];
    list.push(weekScore({ ...f, rank: f.rank }, tier));
    byTeam.set(f.teamId, list);
  }

  const rows: PlacementRow[] = [...byTeam.entries()].map(([teamId, weeks]) => {
    const sorted = [...weeks].sort((a, b) => b.week - a.week);
    return {
      teamId,
      weeks: sorted,
      totalScore: sorted.reduce((n, w) => n + w.score, 0),
      weeksPlayed: sorted.length,
      bestWeek: sorted.length ? Math.min(...sorted.map((w) => w.score)) : null,
    };
  });

  // Lowest total first. Then MORE nights ahead of fewer on the same total — a
  // team that matched it over more weeks did so against more opposition, and it
  // is the only defence here against absence flattering a total. Then the best
  // single night, which at least says something about the volleyball.
  return rows.sort(
    (a, b) =>
      a.totalScore - b.totalScore ||
      b.weeksPlayed - a.weeksPlayed ||
      (a.bestWeek ?? Infinity) - (b.bestWeek ?? Infinity),
  );
}
