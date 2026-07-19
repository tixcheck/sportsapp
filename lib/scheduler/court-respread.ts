/**
 * Re-spread court assignments across the games already on the calendar, without
 * moving any pairing or time. Pure: no DB access.
 *
 * When the court count changes mid-season (e.g. 14 teams now need 7 courts so a
 * full wave can play at once), we don't want to regenerate the schedule — that
 * would wipe played results. Instead we keep every game's date/time/opponents
 * and only reassign which court each one is on, so that the games sharing a time
 * slot (a "wave") land on distinct courts.
 */

export interface RespreadMatch {
  id: string;
  /** UTC ISO instant; games sharing it are one simultaneous wave. */
  scheduledAt: string | null;
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
 * Assign each match a court label so that, within every wave (same instant),
 * courts are handed out distinctly in order. `courtLabels` is the available
 * courts (e.g. ["Court 1", … , "Court 7"]); a wave larger than the court count
 * wraps and is reported as over-capacity rather than silently hidden.
 * Time-TBD games (no instant) are left unassigned.
 */
export function respreadCourts(
  matches: RespreadMatch[],
  courtLabels: string[],
): CourtRespreadResult {
  const empty: CourtRespreadResult = {
    assignments: [],
    waves: 0,
    maxGamesPerWave: 0,
    overCapacityWaves: 0,
  };
  if (courtLabels.length === 0) return empty;

  const byWave = new Map<string, RespreadMatch[]>();
  for (const m of matches) {
    if (!m.scheduledAt) continue;
    const list = byWave.get(m.scheduledAt) ?? [];
    list.push(m);
    byWave.set(m.scheduledAt, list);
  }

  const assignments: { id: string; court: string }[] = [];
  let maxGamesPerWave = 0;
  let overCapacityWaves = 0;

  for (const [, games] of byWave) {
    // Stable order within the wave so assignment is deterministic.
    games.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    maxGamesPerWave = Math.max(maxGamesPerWave, games.length);
    if (games.length > courtLabels.length) overCapacityWaves += 1;

    games.forEach((g, i) => {
      assignments.push({
        id: g.id,
        court: courtLabels[i % courtLabels.length],
      });
    });
  }

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
