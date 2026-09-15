/**
 * A season in sessions: blocks of nights played by the same drafted teams.
 *
 * Big Shoots keeps a team's players together for three Fridays — two regular
 * nights and a playoff — then re-drafts everyone onto Team 1–4. So "Team 1" is
 * a slot, not a group of people: its schedule runs all season, but the six
 * names on it are only true for the current block. Showing a team's whole
 * season beside today's roster says those people play together until May,
 * which is wrong from the second session on.
 *
 * Sessions are counted over nights the league actually PLAYS, never calendar
 * weeks, so a blacked-out holiday produces no night and cannot shift them —
 * the same rule `playoffNightsFor` uses, which is what keeps a session's last
 * night and its playoff night the same night.
 *
 * Pure: no DB, no clock.
 */

import { defaultScheduleDay } from "@/lib/schedule/default-day";

export interface LeagueSession {
  /** 1-based. */
  number: number;
  /** How many sessions the schedule holds, including a short final one. */
  total: number;
  /** This session's nights, `yyyy-MM-dd`, chronological. */
  nights: string[];
}

/**
 * The season's nights in blocks of `sessionNights`.
 *
 * Empty for a league without sessions (null, or under 2 — a one-night session
 * would make every night its own block, which is no grouping at all). A final
 * block shorter than the rest is kept, since those nights are still played.
 */
export function splitSessions(
  nights: string[],
  sessionNights: number | null,
): string[][] {
  if (sessionNights == null || sessionNights < 2) return [];
  const ordered = [...new Set(nights)].sort();
  const out: string[][] = [];
  for (let i = 0; i < ordered.length; i += sessionNights) {
    out.push(ordered.slice(i, i + sessionNights));
  }
  return out;
}

/**
 * The session a spectator is asking about right now.
 *
 * Defined as the session holding the schedule's own default night — the next
 * night that hasn't finished, today included, or the last night once the
 * season is over. Reusing `defaultScheduleDay` rather than restating it means
 * the Teams panel and the Schedule tab can never disagree about which week
 * "now" is. Between a playoff and the next session's first night, that makes
 * the NEXT session current, which is the one people are about to play.
 *
 * Null for a league without sessions, or with nothing scheduled.
 */
export function currentSession(
  nights: string[],
  sessionNights: number | null,
  today: string,
): LeagueSession | null {
  const sessions = splitSessions(nights, sessionNights);
  if (sessions.length === 0) return null;
  const day = defaultScheduleDay(nights, today);
  const index = sessions.findIndex((s) => day != null && s.includes(day));
  if (index < 0) return null;
  return { number: index + 1, total: sessions.length, nights: sessions[index] };
}
