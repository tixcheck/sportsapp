export type MatchOutcome = "win" | "loss" | "tie";

export interface WeekTally {
  /** The league night's calendar date, "YYYY-MM-DD" in the venue timezone. */
  date: string;
  won: number;
  lost: number;
  tied: number;
}

/**
 * Group a team's dated results into per-night win/loss/tie tallies, oldest
 * first — the "Jul 14 · 1/1" week-over-week line on the league standings, so
 * players can see how their record accumulates night to night. Pure: the caller
 * resolves each match's date (venue tz) and the team's outcome.
 */
export function weeklyTallies(
  entries: { date: string; outcome: MatchOutcome }[],
): WeekTally[] {
  const byDate = new Map<string, WeekTally>();
  for (const e of entries) {
    const t = byDate.get(e.date) ?? { date: e.date, won: 0, lost: 0, tied: 0 };
    if (e.outcome === "win") t.won += 1;
    else if (e.outcome === "loss") t.lost += 1;
    else t.tied += 1;
    byDate.set(e.date, t);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
