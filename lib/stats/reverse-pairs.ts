/**
 * Reverse Pairs standings and the partner matrix. Pure: no DB access.
 *
 * Standings are point DIFFERENTIAL, not wins. Every pair on a side takes the
 * margin: a game finishing 25-22 is +3 to all three winners and -3 to all three
 * losers. That is the only fair measure when your result depends on two
 * teammates you did not choose — losing 25-23 with a weak draw says more about
 * you than winning 25-12 with a strong one.
 *
 * The matrix is the thing the organizer currently keeps by hand: an n x n grid
 * of how many times each pair has been teamed with each other pair. It is what
 * tells him the draw is doing its job, and what he checks before running the
 * next night.
 */

export interface ReversePairsGameResult {
  /** The three pairs on each side. */
  sideA: string[];
  sideB: string[];
  /** Null until the score is entered. */
  scoreA: number | null;
  scoreB: number | null;
}

export interface ReversePairsStanding {
  teamId: string;
  /** Sum of point differentials across completed games. */
  differential: number;
  /** Games with a score entered. */
  played: number;
  /** Points scored by, and against, the sides this pair played on. */
  pointsFor: number;
  pointsAgainst: number;
  /** Games their side won, lost and drew. Shown, but never the ranking. */
  won: number;
  lost: number;
  /** 1-based. Ties share a rank and the next one skips, as in athletics. */
  rank: number;
  /**
   * The margin from each of THIS pair's games, in the order they play them —
   * so index 0 is their first game, not round 1. Byes leave no gap, because a
   * pair counts their own games and not the ones they sat out.
   *
   * Null where a game has been drawn but not yet scored, so the columns stay
   * aligned through a night that is only half entered.
   */
  perGame: (number | null)[];
}

/**
 * Order pairs by total point differential, best first.
 *
 * Every pair listed in `teamIds` appears, including those who have not played —
 * a pair missing from the standings reads as an error to whoever is looking for
 * their own name.
 */
export function reversePairsStandings(
  teamIds: string[],
  games: ReversePairsGameResult[],
): ReversePairsStanding[] {
  const blank = (id: string): ReversePairsStanding => ({
    teamId: id,
    differential: 0,
    played: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    won: 0,
    lost: 0,
    rank: 0,
    perGame: [],
  });

  const rows = new Map<string, ReversePairsStanding>();
  for (const id of teamIds) rows.set(id, blank(id));

  for (const g of games) {
    const sides: [string[], number | null, number | null][] = [
      [g.sideA, g.scoreA, g.scoreB],
      [g.sideB, g.scoreB, g.scoreA],
    ];
    for (const [side, mine, theirs] of sides) {
      for (const id of side) {
        // A pair that appears in a game but not in `teamIds` still counts —
        // dropping them would silently lose results.
        const row = rows.get(id) ?? blank(id);
        rows.set(id, row);

        // Every game they are IN gets a column, scored or not. Skipping the
        // unscored ones would shift later games left and quietly renumber them
        // halfway through a night.
        if (mine === null || theirs === null) {
          row.perGame.push(null);
          continue;
        }
        row.perGame.push(mine - theirs);
        row.played += 1;
        row.pointsFor += mine;
        row.pointsAgainst += theirs;
        row.differential += mine - theirs;
        if (mine > theirs) row.won += 1;
        else if (mine < theirs) row.lost += 1;
      }
    }
  }

  const out = [...rows.values()].sort(
    (a, b) =>
      b.differential - a.differential || a.teamId.localeCompare(b.teamId),
  );
  out.forEach((row, i) => {
    row.rank =
      i > 0 && row.differential === out[i - 1].differential
        ? out[i - 1].rank
        : i + 1;
  });
  return out;
}

export interface PartnerMatrix {
  /** Row and column order — the same list, so the grid is square. */
  teamIds: string[];
  /** `counts[i][j]` = times `teamIds[i]` was teamed with `teamIds[j]`. */
  counts: number[][];
  /** Largest off-diagonal value: how often the most-repeated pairing happened. */
  max: number;
  /** Pairings that happened more than once, and how many times. */
  repeats: { a: string; b: string; times: number }[];
  /** Pairings that never happened at all. */
  neverTogether: { a: string; b: string }[];
}

/**
 * How many times each pair has been teamed with each other pair.
 *
 * Symmetric, with a zero diagonal — a pair is not its own partner. Opponents
 * are deliberately NOT counted here: this grid answers "who have I played
 * WITH", which is the question the format is built around.
 */
export function partnerMatrix(
  teamIds: string[],
  games: ReversePairsGameResult[],
): PartnerMatrix {
  const index = new Map(teamIds.map((id, i) => [id, i]));
  const counts = teamIds.map(() => new Array<number>(teamIds.length).fill(0));

  for (const g of games) {
    for (const side of [g.sideA, g.sideB]) {
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          const a = index.get(side[i]);
          const b = index.get(side[j]);
          if (a === undefined || b === undefined) continue;
          counts[a][b] += 1;
          counts[b][a] += 1;
        }
      }
    }
  }

  let max = 0;
  const repeats: PartnerMatrix["repeats"] = [];
  const neverTogether: PartnerMatrix["neverTogether"] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const n = counts[i][j];
      if (n > max) max = n;
      if (n > 1) repeats.push({ a: teamIds[i], b: teamIds[j], times: n });
      if (n === 0) neverTogether.push({ a: teamIds[i], b: teamIds[j] });
    }
  }
  repeats.sort((x, y) => y.times - x.times);

  return { teamIds, counts, max, repeats, neverTogether };
}
