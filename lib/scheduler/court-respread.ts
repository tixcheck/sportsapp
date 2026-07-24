/**
 * Re-spread court assignments across the games already on the calendar, without
 * moving any pairing or time. Pure: no DB access.
 *
 * When the court count changes mid-season (e.g. 14 teams now need 7 courts so a
 * full wave can play at once), we don't want to regenerate the schedule — that
 * would wipe played results. Instead we keep every game's date/time/opponents
 * and only reassign which court each one is on, so that the games sharing a time
 * slot (a "wave") land on distinct courts — with prime courts balanced fairly
 * across teams, seeded from the games already played.
 */

import { assignCourts, type Court } from "./court-assign";

export interface RespreadGame {
  id: string;
  /** UTC ISO instant; games sharing it are one simultaneous wave. */
  scheduledAt: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

export interface CourtRespreadResult {
  assignments: { id: string; court: string }[];
  /** Distinct time slots touched. */
  waves: number;
  /** The most games found in any single wave. */
  maxGamesPerWave: number;
  /** Waves with more games than courts — some courts double up (a conflict). */
  overCapacityWaves: number;
}

/**
 * Assign each game a court so that, within every wave (same instant), courts are
 * distinct, and prime courts are shared fairly across teams. `initialPrimeGames`
 * seeds the fairness ledger from the played weeks, so a team that already had
 * more prime courts is steered off them. Time-TBD games (no instant) are left
 * unassigned; a wave larger than the court count is reported as over-capacity.
 */
export function respreadCourts(
  games: RespreadGame[],
  courts: Court[],
  initialPrimeGames?: ReadonlyMap<string, number>,
): CourtRespreadResult {
  const empty: CourtRespreadResult = {
    assignments: [],
    waves: 0,
    maxGamesPerWave: 0,
    overCapacityWaves: 0,
  };
  if (courts.length === 0) return empty;

  // Key waves on the parsed instant (epoch ms), not the raw string: the app
  // writes scheduled_at in more than one textual form (zone-offset from the
  // generator, `…Z` from push/mid-season, client-verbatim from reschedule), so
  // two simultaneous games can carry byte-different strings. Grouping by instant
  // avoids handing the same court to two games that are actually at once.
  const byWave = new Map<number, RespreadGame[]>();
  for (const g of games) {
    if (!g.scheduledAt) continue;
    const ms = new Date(g.scheduledAt).getTime();
    if (Number.isNaN(ms)) continue;
    const list = byWave.get(ms);
    if (list) list.push(g);
    else byWave.set(ms, [g]);
  }

  // Waves in time order; games within a wave in a stable order (by id).
  const instants = [...byWave.keys()].sort((a, b) => a - b);
  for (const ms of instants) {
    byWave.get(ms)!.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  let maxGamesPerWave = 0;
  let overCapacityWaves = 0;
  for (const ms of instants) {
    const n = byWave.get(ms)!.length;
    maxGamesPerWave = Math.max(maxGamesPerWave, n);
    if (n > courts.length) overCapacityWaves += 1;
  }

  const assigned = assignCourts(
    instants.map((ms, round) => ({
      round,
      byeTeamId: null,
      pairs: byWave.get(ms)!.map((g) => ({
        homeTeamId: g.homeTeamId ?? g.id,
        awayTeamId: g.awayTeamId ?? g.id,
      })),
    })),
    courts,
    initialPrimeGames,
  );

  const assignments: { id: string; court: string }[] = [];
  instants.forEach((ms, i) => {
    byWave.get(ms)!.forEach((g, j) => {
      assignments.push({ id: g.id, court: assigned[i].courts[j] });
    });
  });

  return {
    assignments,
    waves: byWave.size,
    maxGamesPerWave,
    overCapacityWaves,
  };
}

/** Default court labels for a plain N-court league: "Court 1" … "Court N". */
export function numberedCourts(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => `Court ${i + 1}`);
}
