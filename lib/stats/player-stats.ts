/**
 * Per-player statistics, from one side's view of a set.
 *
 * Pure — no DB, no clock. It takes a flat list of "here is a set, this is what
 * my side scored and what was scored on me" and returns the numbers. That seam
 * is the whole point: WHICH sets belong to a player is a separate, harder
 * question that differs by format.
 *
 * In a fixed-pairs league a team IS its players, so a player's sets are their
 * team's sets and nothing else is needed. In a 6s league where people miss
 * nights, attendance decides it. Both feed the same function, so the 6s work
 * adds an attribution rule rather than a second copy of the maths.
 *
 * The definitions mirror the ones an organizer already keeps by hand in a
 * spreadsheet, deliberately — matching numbers they can check is what makes
 * this trustworthy. "Games played" therefore means SETS, not matches.
 */

/** One set, from the perspective of the player whose stats these are. */
export type SetResult = {
  /** Points their side scored. */
  for: number;
  /** Points scored against them. */
  against: number;
};

export type PlayerStats = {
  /** Sets played. In a league playing six a night this doubles as attendance. */
  gamesPlayed: number;
  wins: number;
  losses: number;
  /** Level sets. Always 0 for volleyball; softball regular season can draw. */
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  /**
   * Points for ÷ points against. 1.0 = you score exactly what's scored on you.
   * Infinity when nothing was ever scored against them, 0 when they never
   * scored — both real, both rendered as a dash rather than a number.
   */
  forAgainstRatio: number;
  /** Points scored per set — "what a typical set looks like for you". */
  avgPointsFor: number;
  /** Wins ÷ sets played. Draws count as neither. */
  winPct: number;
  /** Every point in their sets, both directions. */
  pointsPlayed: number;
  /** Points played per set — a measure of how long their sets run. */
  pointsPerGame: number;
  /** Sets won by `clutchMargin` or fewer. */
  clutchWins: number;
  /** Sets lost by `clutchMargin` or fewer. */
  clutchLosses: number;
  /** Clutch wins − clutch losses. The headline "are you clutch" number. */
  netClutch: number;
  /** Share of their sets that were close either way — how often it's tight. */
  clutchRate: number;
};

/** Won or lost by this many points or fewer counts as clutch. */
export const DEFAULT_CLUTCH_MARGIN = 2;

const EMPTY: PlayerStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  forAgainstRatio: 0,
  avgPointsFor: 0,
  winPct: 0,
  pointsPlayed: 0,
  pointsPerGame: 0,
  clutchWins: 0,
  clutchLosses: 0,
  netClutch: 0,
  clutchRate: 0,
};

/**
 * Ratio that doesn't lie when the denominator is zero.
 *
 * A player who has never conceded a point has an undefined ratio, not a zero
 * one — returning 0 would rank the best possible record as the worst.
 */
function ratio(num: number, den: number): number {
  if (den === 0) return num > 0 ? Infinity : 0;
  return num / den;
}

export function computePlayerStats(
  sets: SetResult[],
  { clutchMargin = DEFAULT_CLUTCH_MARGIN }: { clutchMargin?: number } = {},
): PlayerStats {
  if (sets.length === 0) return { ...EMPTY };

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let clutchWins = 0;
  let clutchLosses = 0;

  for (const s of sets) {
    pointsFor += s.for;
    pointsAgainst += s.against;

    const margin = s.for - s.against;
    if (margin === 0) {
      // A drawn set is neither won nor lost, and cannot be clutch: "won by 2 or
      // fewer" needs a winner. Counting it either way would flatter or punish
      // someone for a result nobody lost.
      draws += 1;
      continue;
    }

    const close = Math.abs(margin) <= clutchMargin;
    if (margin > 0) {
      wins += 1;
      if (close) clutchWins += 1;
    } else {
      losses += 1;
      if (close) clutchLosses += 1;
    }
  }

  const gamesPlayed = sets.length;
  const pointsPlayed = pointsFor + pointsAgainst;

  return {
    gamesPlayed,
    wins,
    losses,
    draws,
    pointsFor,
    pointsAgainst,
    forAgainstRatio: ratio(pointsFor, pointsAgainst),
    avgPointsFor: pointsFor / gamesPlayed,
    winPct: wins / gamesPlayed,
    pointsPlayed,
    pointsPerGame: pointsPlayed / gamesPlayed,
    clutchWins,
    clutchLosses,
    netClutch: clutchWins - clutchLosses,
    clutchRate: (clutchWins + clutchLosses) / gamesPlayed,
  };
}

/**
 * Order a stat table the way the organizer's spreadsheet is sorted: most
 * clutch first.
 *
 * Net clutch alone leaves a lot of ties — it is a small integer over a whole
 * season — so win percentage breaks them, then points ratio, then name for a
 * stable order between renders.
 */
export function byNetClutch<T extends { stats: PlayerStats; name: string }>(
  a: T,
  b: T,
): number {
  return (
    b.stats.netClutch - a.stats.netClutch ||
    b.stats.winPct - a.stats.winPct ||
    b.stats.forAgainstRatio - a.stats.forAgainstRatio ||
    a.name.localeCompare(b.name)
  );
}

/**
 * A ratio for display: `1.143` → `"114%"`. An undefined ratio (nothing ever
 * conceded) is a dash, because "∞%" in a table column reads as a bug.
 */
export function formatRatioPct(r: number): string {
  if (!Number.isFinite(r)) return "—";
  return `${Math.round(r * 100)}%`;
}

/** `0.536` → `"53.6%"`. */
export function formatPct(r: number, digits = 1): string {
  if (!Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(digits)}%`;
}

/** Signed, for a column where the sign is the message: `+8`, `-13`, `0`. */
export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
