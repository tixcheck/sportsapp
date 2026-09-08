import { DateTime } from "luxon";

/**
 * Which competitions still belong on the public "find a league" list.
 *
 * A finished season is noise to someone looking for somewhere to play: it reads
 * as an option, costs a click, and ends in a dead page. So discovery shows only
 * what has not finished yet.
 *
 * The rule has to cope with three shapes of data:
 *
 *   1. Both dates set - the normal case. It is over once the end date has
 *      passed. An event ending TODAY still shows; people look up the league
 *      they are playing in tonight.
 *   2. Only a start date - a one-day tournament. Same rule against that date.
 *   3. No dates at all - every King of the Court event, because the KotC form
 *      has no date field. These cannot be dated, so they fall back to when
 *      they were created and drop off the list after a grace period. Without
 *      that fallback a KotC run last Canada Day sits on the front page forever;
 *      with a blanket "hide the undated" a brand new one would never appear.
 *
 * The real fix for (3) is a date on the KotC form. Until then this keeps the
 * list honest without making new events invisible.
 */
export const DATELESS_GRACE_DAYS = 30;

/** Today where this platform lives. These are plain dates, never timestamps. */
export function torontoToday(now: DateTime = DateTime.now()): string {
  return now.setZone("America/Toronto").toISODate() as string;
}

/**
 * The PostgREST `or` filter selecting competitions that have not finished.
 *
 * Kept as one builder so the three cases above stay in one place - the list
 * page, an org page or anything else that needs the same rule gets the same
 * answer rather than reimplementing two of the three branches.
 */
export function notFinishedFilter(
  today: string = torontoToday(),
  graceDays: number = DATELESS_GRACE_DAYS,
): string {
  const cutoff = DateTime.fromISO(today, { zone: "America/Toronto" })
    .minus({ days: graceDays })
    .toISODate();

  return [
    `end_date.gte.${today}`,
    `and(end_date.is.null,start_date.gte.${today})`,
    `and(end_date.is.null,start_date.is.null,created_at.gte.${cutoff})`,
  ].join(",");
}

/**
 * The same rule in plain terms, for sorting and for tests.
 *
 * The database does the filtering; this exists so the intent is expressed once
 * in code that can be exercised directly against awkward inputs.
 */
export function hasFinished(
  c: {
    startDate: string | null;
    endDate: string | null;
    createdAt?: string | null;
  },
  today: string = torontoToday(),
  graceDays: number = DATELESS_GRACE_DAYS,
): boolean {
  const known = c.endDate ?? c.startDate;
  if (known) return known < today;

  if (!c.createdAt) return false;
  const cutoff = DateTime.fromISO(today, { zone: "America/Toronto" })
    .minus({ days: graceDays })
    .toISODate() as string;
  return c.createdAt.slice(0, 10) < cutoff;
}
