/**
 * Split a division's pool games across the tournament days (PRD §7, multi-day).
 * Pure: no DB. The organizer sets a preferred games-per-team target for each day
 * (e.g. [7, 4] for an 11-game, 2-day event). A match involves two teams, so a
 * team's exact target can't always be met — this assigns each match a day such
 * that no team EXCEEDS its cumulative target on any early day, letting the last
 * day absorb the remainder. So a 7/4 split flexes down to 6/5 for a team whose
 * 7th-game opponent already filled day 1, never up past the cap.
 */

export interface DaySplitMatch {
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Assign a 0-based day to each match, in the given play order (earlier matches
 * fill earlier days). `perDayTargets` is games-per-team for each day; the last
 * day is uncapped so nothing is dropped. Returns one day per match, aligned to
 * the input order.
 *
 * A match goes on the earliest day where BOTH its teams are still within that
 * day's cumulative target; if neither is (both already full through the second-
 * to-last day), it lands on the last day. With a single target it's all day 0.
 */
export function assignMatchDays(
  matches: DaySplitMatch[],
  perDayTargets: number[],
): number[] {
  const targets = perDayTargets.filter((t) => t > 0);
  if (targets.length <= 1) return matches.map(() => 0);

  // Cumulative cap per day: after day d a team may have played at most cum[d]
  // games. The last day is uncapped (Infinity) so remainder always fits.
  const cum: number[] = [];
  let running = 0;
  for (let d = 0; d < targets.length; d++) {
    running += targets[d];
    cum.push(d === targets.length - 1 ? Infinity : running);
  }
  const lastDay = targets.length - 1;

  const played = new Map<string, number>();
  const countOf = (id: string) => played.get(id) ?? 0;

  return matches.map((m) => {
    const nextHome = countOf(m.homeTeamId) + 1;
    const nextAway = countOf(m.awayTeamId) + 1;

    let day = lastDay;
    for (let d = 0; d < targets.length; d++) {
      if (nextHome <= cum[d] && nextAway <= cum[d]) {
        day = d;
        break;
      }
    }
    played.set(m.homeTeamId, nextHome);
    played.set(m.awayTeamId, nextAway);
    return day;
  });
}
