import { DateTime } from "luxon";

/**
 * Whether a match is on a later calendar day than today, in the venue timezone
 * — you can't enter its score until game day (or after). Unscheduled matches
 * (no date) aren't locked. Organizers can still override; this gates players.
 */
export function isFutureMatch(
  scheduledAt: string | null,
  timezone: string,
): boolean {
  if (!scheduledAt) return false;
  const day = DateTime.fromISO(scheduledAt, { zone: timezone }).startOf("day");
  const today = DateTime.now().setZone(timezone).startOf("day");
  return day > today;
}
