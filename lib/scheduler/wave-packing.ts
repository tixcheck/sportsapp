/**
 * Pack pool games into timed waves — the layout for events where nobody referees.
 *
 * The existing layout treats a pool as an indivisible block on one court
 * (`court-packing.ts`), and that is not an arbitrary choice: it is what lets the
 * pool's idle teams referee the game in front of them. Beach Barbiez asked for
 * Summer Forever to run without team refs, and the moment reffing goes away that
 * constraint goes with it — a pool's games no longer have to share a court, so
 * games can be packed across pool boundaries and every court can be busy.
 *
 * What that buys is bounded by arithmetic, not cleverness. 36 games on 8 courts
 * is ceil(36/8) = 5 waves however you arrange them; the old layout ran 6 pools
 * on 6 courts for 6 waves. One wave — 45 minutes — is the whole prize, and this
 * reaches it.
 *
 * The rule each wave: take up to `courts.length` games whose teams are all free,
 * preferring the games whose teams have waited longest. That is the same
 * longest-waiting-first idea `spreadSinglePool` already uses inside one pool,
 * generalised across pools. It keeps rest even — for 3 pools of 4 on 4 courts
 * every team gets at least a full wave off between games, which is better
 * spacing than one-pool-per-court gives some teams.
 *
 * Pure + deterministic: ties break on input order, so the same draw always
 * produces the same schedule.
 */
import type { LayoutPool, ScheduledPoolMatch } from "./pools";
import type { TeamId } from "./round-robin";

interface PendingGame {
  poolIndex: number;
  round: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** Input order — the deterministic tiebreak, and nothing else. */
  index: number;
}

/** Every game in every pool, flattened, in a stable order. */
function flatten(pools: LayoutPool[]): PendingGame[] {
  const out: PendingGame[] = [];
  pools.forEach((pool, poolIndex) => {
    for (const round of pool.rounds) {
      for (const pair of round.pairs) {
        out.push({
          poolIndex,
          round: round.round,
          homeTeamId: pair.homeTeamId,
          awayTeamId: pair.awayTeamId,
          index: out.length,
        });
      }
    }
  });
  return out;
}

/**
 * Lay every pool's games onto `courts` as team-disjoint waves.
 *
 * `courts` is a list of real court numbers, not a count, so a division can be
 * given its own courts (Mens on 1,3,5,7 while Womens run 2,4,6,8) and the two
 * simply don't collide. Refs are null throughout — this layout exists precisely
 * because no team is reffing.
 */
export function packPoolsIntoWaves(
  pools: LayoutPool[],
  courts: number[],
): ScheduledPoolMatch[] {
  const courtList = courts.length > 0 ? courts : [1];
  const remaining = flatten(pools);
  if (remaining.length === 0) return [];

  // Wave a team last played in; -1 = hasn't played, so it sorts as most rested.
  const lastWave = new Map<TeamId, number>();
  const restOf = (id: TeamId, wave: number) => wave - (lastWave.get(id) ?? -1);

  // Games a team has already had. Rest alone is not enough to spread a pool out:
  // when two pools are equally rested, always taking the first one in input
  // order marches one pool straight through waves 0, 1 and 2 — three games back
  // to back, which is worse for those players than the one-pool-per-court
  // layout this replaces. Breaking the tie toward whoever has played least
  // rotates the pools instead.
  const playedCount = new Map<TeamId, number>();
  const gamesOf = (id: TeamId) => playedCount.get(id) ?? 0;

  const out: ScheduledPoolMatch[] = [];
  let wave = 0;
  let left = remaining;

  while (left.length > 0) {
    // Rank by the most-rested team in each game (max, not min): a game with one
    // fresh team shouldn't be held back by its other team having just played.
    const ranked = [...left].sort(
      (a, b) =>
        Math.max(restOf(b.homeTeamId, wave), restOf(b.awayTeamId, wave)) -
          Math.max(restOf(a.homeTeamId, wave), restOf(a.awayTeamId, wave)) ||
        gamesOf(a.homeTeamId) +
          gamesOf(a.awayTeamId) -
          (gamesOf(b.homeTeamId) + gamesOf(b.awayTeamId)) ||
        a.index - b.index,
    );

    const busy = new Set<TeamId>();
    const picked: PendingGame[] = [];
    for (const game of ranked) {
      if (picked.length >= courtList.length) break;
      if (busy.has(game.homeTeamId) || busy.has(game.awayTeamId)) continue;
      busy.add(game.homeTeamId);
      busy.add(game.awayTeamId);
      picked.push(game);
    }

    // A wave that can pick nothing would loop forever. It cannot happen — any
    // remaining game's two teams are free at the start of a wave — but a guard
    // beats an infinite loop in a scheduler an organizer runs on event morning.
    if (picked.length === 0) break;

    picked.forEach((game, i) => {
      out.push({
        poolIndex: game.poolIndex,
        court: courtList[i],
        slot: wave,
        round: game.round,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        refTeamId: null,
      });
      lastWave.set(game.homeTeamId, wave);
      lastWave.set(game.awayTeamId, wave);
      playedCount.set(game.homeTeamId, gamesOf(game.homeTeamId) + 1);
      playedCount.set(game.awayTeamId, gamesOf(game.awayTeamId) + 1);
    });

    const taken = new Set(picked.map((g) => g.index));
    left = left.filter((g) => !taken.has(g.index));
    wave += 1;
  }

  return out;
}

/**
 * Split `courtCount` courts between divisions by interleaving, so each division
 * gets an alternating set: two divisions on 8 courts become [1,3,5,7] and
 * [2,4,6,8]. Interleaved rather than blocked because that is what the organizer
 * asked for, and it puts each division's courts across the whole site rather
 * than crowding one end of it.
 */
export function interleaveCourts(
  courtCount: number,
  divisions: number,
): number[][] {
  const n = Math.max(1, divisions);
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let c = 1; c <= Math.max(0, courtCount); c++) {
    out[(c - 1) % n].push(c);
  }
  return out;
}
