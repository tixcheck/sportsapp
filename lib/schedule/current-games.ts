import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";

/** Statuses that mean a game is done — it can't be the "current" game. */
const FINAL = new Set(["completed", "forfeit", "cancelled"]);

// Only called on today's real games, which always carry a scheduled time.
function byStart(a: ScheduleMatch, b: ScheduleMatch): number {
  return (
    (a.scheduledAt as string).localeCompare(b.scheduledAt as string) ||
    (a.round ?? 0) - (b.round ?? 0)
  );
}

/** Trailing court number for stable ordering ("Court 2" < "Court 10"). */
function courtRank(court: string): number {
  const m = court.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

export interface CourtGame {
  court: string;
  match: ScheduleMatch;
}

/**
 * The games to show under "Now playing" for the current moment. Time-gated to
 * the day being played: nothing shows until `leadMinutes` before that day's
 * first game, and only games scheduled for today (in the venue timezone) are
 * considered. Within that window every court with a game today is shown — the
 * in-progress game if one is being scored, else the earliest game not yet Final
 * (so the board fills the moment the window opens, then advances per court as
 * scores come in). A court whose games are all Final drops off; once the whole
 * day is done the section is empty again.
 */
export function currentGames(
  matches: ScheduleMatch[],
  now: Date,
  timezone: string,
  leadMinutes = 30,
): CourtGame[] {
  const nowDt = DateTime.fromJSDate(now, { zone: timezone });
  const today = nowDt.toISODate();

  const todays = matches.filter(
    (m) =>
      m.court &&
      m.homeTeamId &&
      m.awayTeamId &&
      m.scheduledAt &&
      DateTime.fromISO(m.scheduledAt, { zone: timezone }).toISODate() === today,
  );
  if (todays.length === 0) return [];

  // The board opens `leadMinutes` before the day's earliest game.
  const firstStart = todays
    .map((m) => DateTime.fromISO(m.scheduledAt as string, { zone: timezone }))
    .reduce((min, d) => (d < min ? d : min));
  if (nowDt < firstStart.minus({ minutes: leadMinutes })) return [];

  const byCourt = new Map<string, ScheduleMatch[]>();
  for (const m of todays) {
    const arr = byCourt.get(m.court as string);
    if (arr) arr.push(m);
    else byCourt.set(m.court as string, [m]);
  }

  const out: CourtGame[] = [];
  for (const [court, games] of byCourt) {
    const sorted = [...games].sort(byStart);
    const live = sorted.find((g) => g.status === "in_progress");
    const current = live ?? sorted.find((g) => !FINAL.has(g.status));
    if (current) out.push({ court, match: current });
  }
  return out.sort((a, b) => courtRank(a.court) - courtRank(b.court));
}
