import { DateTime } from "luxon";

/**
 * A night's lineup: who played for one team, on one evening.
 *
 * Subbing is a NIGHT-level fact, not a match-level one. Nobody fills in for one
 * game of six and hands the shirt back — a sub turns up, plays the night, and
 * goes home. Asking an organizer to tick the same six people six times would be
 * an interface built around the storage rather than around what happened.
 *
 * The storage stays per match, deliberately. `0089_appearances.sql` chose that
 * grain so a player who arrives after game two can be credited with the four
 * they played, and collapsing it to per-night would either invent sets they
 * missed or lose the night. So the night is the unit of INPUT, and it fans out
 * across that team's matches on the night. The migration says as much: "The UI
 * still works a night at a time — it just writes several rows."
 *
 * Pure: no DB, no clock. The timezone is the competition's, because a league in
 * Toronto is still on Tuesday night at 9pm even when the organizer is in
 * Vancouver looking at Tuesday afternoon.
 */

export interface NightMatch {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** ISO instant, or null for a match nobody has scheduled yet. */
  scheduledAt: string | null;
}

/**
 * Which night a match belongs to, as `yyyy-MM-dd` in the competition's zone.
 *
 * Same derivation the schedule view uses for its day tabs — the organizer must
 * be filling in the lineup for the night they can see, not one an hour either
 * side of it.
 */
export function nightOf(
  scheduledAt: string | null,
  timezone: string,
): string | null {
  if (!scheduledAt) return null;
  const dt = DateTime.fromISO(scheduledAt, { zone: timezone });
  return dt.isValid ? dt.toFormat("yyyy-MM-dd") : null;
}

/** Every night this competition plays on, chronological. */
export function playingNights(
  matches: NightMatch[],
  timezone: string,
): string[] {
  const nights = new Set<string>();
  for (const m of matches) {
    const n = nightOf(m.scheduledAt, timezone);
    if (n) nights.add(n);
  }
  // yyyy-MM-dd sorts chronologically as text, which is why it is formatted so.
  return [...nights].sort();
}

/**
 * The matches one team plays on one night — the rows a single lineup writes to.
 *
 * Ordered by id so a caller writing them is deterministic, and because the
 * caller has no reason to care which order they land in.
 */
export function matchesForTeamOnNight(
  matches: NightMatch[],
  teamId: string,
  night: string,
  timezone: string,
): string[] {
  return matches
    .filter(
      (m) =>
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        nightOf(m.scheduledAt, timezone) === night,
    )
    .map((m) => m.id)
    .sort();
}

/** Every team with a game on this night, in the order they first appear. */
export function teamsPlayingOnNight(
  matches: NightMatch[],
  night: string,
  timezone: string,
): string[] {
  const out: string[] = [];
  for (const m of matches) {
    if (nightOf(m.scheduledAt, timezone) !== night) continue;
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}
