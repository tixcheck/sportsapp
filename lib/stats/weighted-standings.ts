/**
 * Standings that reward the tier you played in, not just what you won.
 *
 * A ladder moves teams between tiers every week, so a season's results aren't
 * comparable on their own: three set wins against the top tier is a harder
 * night than three against the bottom one, and a plain table says they are the
 * same. Mango Sports weight it — a team earns points for BEING in a tier that
 * week, and more per set won the higher the tier.
 *
 * Worked through, in their words: "Team A is in Tier 1, so they automatically
 * have 10. They also won 3 sets so that's 15 additional points. In total 25
 * points for that week."
 *
 * Pure, and deliberately per WEEK rather than per season, because that is the
 * unit a ladder actually works in — a team can be in Tier 1 one week and Tier 2
 * the next, and the whole point of the weighting is that those weeks are worth
 * different amounts.
 */

export type TierWeight = {
  divisionId: string;
  name: string;
  /** Awarded once for being placed in this tier that week. */
  base: number;
  /** Awarded per set won while in this tier. */
  perSetWin: number;
};

export type WeekPlacement = {
  teamId: string;
  week: number;
  divisionId: string;
  /** Sets this team won that week. */
  setsWon: number;
};

export type WeeklyPoints = {
  week: number;
  divisionId: string;
  tierName: string;
  base: number;
  setsWon: number;
  fromWins: number;
  total: number;
};

export type WeightedRow = {
  teamId: string;
  /** Newest week first — the table shows a running story, not a single number. */
  weeks: WeeklyPoints[];
  totalPoints: number;
  totalSetsWon: number;
  weeksPlayed: number;
};

/**
 * Points for one team-week.
 *
 * The base is awarded for being PLACED in the tier, not for winning anything.
 * That is what "if you play in tier 1 you automatically get 10 points" says,
 * and it is the part that makes a hard week in the top tier worth more than an
 * easy one below it even when you lose.
 */
export function weekPoints(
  placement: WeekPlacement,
  weight: TierWeight,
): WeeklyPoints {
  const fromWins = placement.setsWon * weight.perSetWin;
  return {
    week: placement.week,
    divisionId: placement.divisionId,
    tierName: weight.name,
    base: weight.base,
    setsWon: placement.setsWon,
    fromWins,
    total: weight.base + fromWins,
  };
}

/**
 * A weighted table, highest first.
 *
 * Placements whose tier has no weight configured are SKIPPED rather than
 * counted as zero. A tier nobody has priced yet is an unanswered question, and
 * scoring it as nothing would quietly tell an organizer their team earned
 * nothing that week.
 */
export function weightedStandings(
  placements: WeekPlacement[],
  weights: TierWeight[],
): WeightedRow[] {
  const byDivision = new Map(weights.map((w) => [w.divisionId, w]));
  const byTeam = new Map<string, WeeklyPoints[]>();

  for (const p of placements) {
    const weight = byDivision.get(p.divisionId);
    if (!weight) continue;
    const list = byTeam.get(p.teamId) ?? [];
    list.push(weekPoints(p, weight));
    byTeam.set(p.teamId, list);
  }

  const rows: WeightedRow[] = [...byTeam.entries()].map(([teamId, weeks]) => {
    const sorted = [...weeks].sort((a, b) => b.week - a.week);
    return {
      teamId,
      weeks: sorted,
      totalPoints: sorted.reduce((n, w) => n + w.total, 0),
      totalSetsWon: sorted.reduce((n, w) => n + w.setsWon, 0),
      weeksPlayed: sorted.length,
    };
  });

  // Points, then sets won, then fewest weeks — a team matching another's total
  // in fewer nights has done more with less, which is the only tiebreak here
  // that says something about the volleyball.
  return rows.sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.totalSetsWon - a.totalSetsWon ||
      a.weeksPlayed - b.weeksPlayed,
  );
}
