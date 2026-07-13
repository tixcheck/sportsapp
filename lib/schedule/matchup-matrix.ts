import type { ScheduleMatch } from "@/lib/queries/leagues";

export interface MatchupMatrix {
  /** Teams in a stable display order (by name), each with its grid index. */
  teams: { id: string; name: string }[];
  /**
   * Square and aligned to `teams`: counts[i][j] = how many games team i and
   * team j have against each other. Symmetric; the diagonal is 0.
   */
  counts: number[][];
  /** True when every distinct pair of teams meets at least once. */
  everyonePlaysEveryone: boolean;
  /** The most times any single pair meets (0 if no games yet). */
  maxRepeat: number;
}

/**
 * Build the who-plays-whom matrix from a schedule so an organizer can verify at
 * a glance that everyone plays everyone and see who has repeat matchups. Pure —
 * counts every game with two known teams (ref duties and byes don't count).
 */
export function buildMatchupMatrix(matches: ScheduleMatch[]): MatchupMatrix {
  const names = new Map<string, string>();
  for (const m of matches) {
    if (m.homeTeamId) names.set(m.homeTeamId, m.homeTeamName ?? m.homeTeamId);
    if (m.awayTeamId) names.set(m.awayTeamId, m.awayTeamName ?? m.awayTeamId);
  }

  const teams = [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const index = new Map(teams.map((t, i) => [t.id, i] as const));

  const n = teams.length;
  const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const m of matches) {
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const i = index.get(m.homeTeamId);
    const j = index.get(m.awayTeamId);
    if (i == null || j == null || i === j) continue;
    counts[i][j] += 1;
    counts[j][i] += 1;
  }

  let everyonePlaysEveryone = n > 1;
  let maxRepeat = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (counts[i][j] === 0) everyonePlaysEveryone = false;
      if (counts[i][j] > maxRepeat) maxRepeat = counts[i][j];
    }
  }

  return { teams, counts, everyonePlaysEveryone, maxRepeat };
}
