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

/**
 * Whether the viewer may clear a match result — wiping its sets and returning it
 * to "not played yet". Organizer-only. Playoff (bracket) matches are excluded:
 * un-scoring one would desync the downstream bracket slots, which this action
 * doesn't unwind. Pool/league matches are safe to clear (standings just
 * recompute).
 */
export function canClearResult(opts: {
  isAdmin: boolean;
  bracketPosition: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!opts.isAdmin) {
    return { ok: false, reason: "Only the organizer can clear a result." };
  }
  if (opts.bracketPosition !== null) {
    return {
      ok: false,
      reason:
        "Playoff matches can't be cleared here — it would desync the bracket.",
    };
  }
  return { ok: true };
}
