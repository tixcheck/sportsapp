/**
 * Ladder league — planning one night, and ranking it afterwards. Pure: no DB.
 *
 * A ladder night is drawn one week at a time (the whole season can't be
 * pre-generated, because who plays whom depends on last week's results). This
 * turns "here are the tiers and everyone gets 6 sets" into concrete games with
 * a wave and a court, and afterwards turns the night's scores into the tier
 * orderings that `applyLadderMovement` moves teams on.
 *
 * **A meeting's count becomes that many match rows.** Six sets each in a
 * 3-team tier is 1v2, 2v3, 3v1 three times over — nine single-set games, each
 * scored on its own. In "games" mode the same nine rows use the league's normal
 * match format instead. Keeping one row per game means standings, score entry
 * and the tiebreakers all work unchanged.
 */

import { splitTierNight } from "./ladder-split";
import { rankStandings, type MatchResult, type RankMode } from "./tiebreakers";
import type { LadderTier } from "./ladder-movement";

export interface LadderWeekTier {
  divisionId: string;
  teamIds: string[];
}

export interface PlannedLadderMatch {
  divisionId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** 0-based game-of-the-night; drives the staggered start time. */
  wave: number;
  /** 1-based court within the night's pool of courts. */
  courtIndex: number;
}

export interface LadderWeekPlan {
  matches: PlannedLadderMatch[];
  /** Teams that couldn't be given the full target — see splitTierNight. */
  shortedTeamIds: string[];
  /** Games in the busiest wave; above the court count means courts double up. */
  maxGamesPerWave: number;
  /** How many waves the night takes — the number that has to fit the slot. */
  waves: number;
}

/**
 * Draw one night for every tier.
 *
 * All tiers share the night's courts, so games are packed globally: a wave is
 * one round of simultaneous games across the whole venue, not per tier. Tiers
 * are interleaved so no single tier is left waiting until the end of the night.
 */
export function planLadderWeek(
  tiers: LadderWeekTier[],
  target: number,
  courts: number,
  week = 0,
): LadderWeekPlan {
  const courtCount = Math.max(1, Math.floor(courts));
  const shortedTeamIds: string[] = [];

  // Expand each tier's meetings into one game per set (or per game), ordered so
  // the pair that just sat out plays next: 1v2, 2v3, 3v1, 1v2, … Emitting a
  // pairing's repeats together instead (1v2, 1v2, 2v3, …) leaves one team
  // watching two in a row and then playing four straight.
  const perTier = tiers.map((tier) => {
    const split = splitTierNight({
      teamIds: tier.teamIds,
      target,
      week,
    });
    shortedTeamIds.push(...split.shortedTeamIds);

    const pool = split.meetings.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      left: m.count,
    }));
    const games: {
      divisionId: string;
      homeTeamId: string;
      awayTeamId: string;
    }[] = [];
    let previous: { homeTeamId: string; awayTeamId: string } | null = null;

    while (pool.some((p) => p.left > 0)) {
      let best = -1;
      let bestScore = -Infinity;
      for (const [i, p] of pool.entries()) {
        if (p.left <= 0) continue;
        // Prefer whoever sat out the last game; never repeat a pairing
        // back-to-back; among equals, run down the busiest pairing first so
        // the night doesn't end with one pair playing itself repeatedly.
        const rested = previous
          ? [p.homeTeamId, p.awayTeamId].filter(
              (t) => t !== previous!.homeTeamId && t !== previous!.awayTeamId,
            ).length
          : 0;
        const samePair =
          previous != null &&
          p.homeTeamId === previous.homeTeamId &&
          p.awayTeamId === previous.awayTeamId;
        const score = rested * 100 + p.left - (samePair ? 1000 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best === -1) break;
      const chosen = pool[best];
      chosen.left -= 1;
      previous = {
        homeTeamId: chosen.homeTeamId,
        awayTeamId: chosen.awayTeamId,
      };
      games.push({
        divisionId: tier.divisionId,
        homeTeamId: chosen.homeTeamId,
        awayTeamId: chosen.awayTeamId,
      });
    }
    return games;
  });

  // Interleave tiers so every tier starts early rather than one tier playing
  // the whole first half of the night.
  const ordered: {
    divisionId: string;
    homeTeamId: string;
    awayTeamId: string;
  }[] = [];
  const cursors = perTier.map(() => 0);
  let remaining = perTier.reduce((n, g) => n + g.length, 0);
  while (remaining > 0) {
    for (const [t, games] of perTier.entries()) {
      const i = cursors[t];
      if (i >= games.length) continue;
      ordered.push(games[i]);
      cursors[t] += 1;
      remaining -= 1;
    }
  }

  // Pack into waves, never putting a team on two courts at once.
  const matches: PlannedLadderMatch[] = [];
  const waveTeams: Set<string>[] = [];
  const waveCount: number[] = [];
  for (const game of ordered) {
    let wave = 0;
    for (;;) {
      if (!waveTeams[wave]) {
        waveTeams[wave] = new Set();
        waveCount[wave] = 0;
      }
      const busy =
        waveTeams[wave].has(game.homeTeamId) ||
        waveTeams[wave].has(game.awayTeamId);
      if (!busy && waveCount[wave] < courtCount) break;
      wave += 1;
    }
    waveTeams[wave].add(game.homeTeamId);
    waveTeams[wave].add(game.awayTeamId);
    waveCount[wave] += 1;
    matches.push({
      ...game,
      wave,
      courtIndex: waveCount[wave],
    });
  }

  return {
    matches,
    shortedTeamIds,
    maxGamesPerWave: waveCount.length ? Math.max(...waveCount) : 0,
    waves: waveCount.length,
  };
}

/**
 * Rank each tier on the night just played, best first — the input
 * `applyLadderMovement` needs.
 *
 * Only that night's games count. A ladder is deliberately short-memory: you
 * finish bottom tonight, you drop tonight, regardless of how the season has
 * gone. Ranking runs through the league's configured tiebreaker hierarchy, so
 * the order is the same one the standings table would show.
 */
export function rankLadderNight(
  tiers: LadderWeekTier[],
  matches: MatchResult[],
  mode: RankMode = "ova",
): LadderTier[] {
  return tiers.map((tier) => {
    const inTier = new Set(tier.teamIds);
    const own = matches.filter(
      (m) => inTier.has(m.homeTeamId) && inTier.has(m.awayTeamId),
    );
    const ranked = rankStandings(tier.teamIds, own, undefined, mode);
    return {
      divisionId: tier.divisionId,
      rankedTeamIds: ranked.map((r) => r.teamId),
    };
  });
}
