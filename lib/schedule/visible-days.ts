/**
 * Which day tabs a schedule should offer. Pure: no clock, no DB.
 *
 * A 32-week season renders 32 chips, and by March that is a wall of buttons
 * covering the thing somebody opened the page to read. The owner, looking at
 * Big Shoots on week 2: "Its showing every possible weeks schedule. Only show
 * past and the next weeks schedule."
 *
 * So: every night up to and including the next one still to come. Past nights
 * are worth keeping — people look up results — and exactly one night ahead is
 * what anybody is planning around. Everything beyond that is noise until it
 * gets closer.
 *
 * THE CUTOFF IS `defaultScheduleDay`'S ANSWER, deliberately, rather than a
 * second rule that means roughly the same thing. That function decides which
 * tab the schedule OPENS on; if the two ever disagreed, the schedule would open
 * on a day that isn't in its own list. `currentSession` leans on it for the same
 * reason.
 *
 * `today` is passed in so the caller resolves it in the COMPETITION's timezone,
 * and so this stays testable. Computing it inside the client component would
 * give one answer on the server pass and another in the browser.
 */

import { defaultScheduleDay } from "@/lib/schedule/default-day";

/**
 * @param days Playing days as `yyyy-MM-dd`, any order.
 * @param today `yyyy-MM-dd` in the competition's timezone.
 * @returns The days to offer, chronological. Empty when nothing is scheduled.
 */
export function visibleScheduleDays(days: string[], today: string): string[] {
  if (days.length === 0) return [];
  // Lexicographic order is chronological for yyyy-MM-dd, which is why the day
  // keys are formatted that way.
  const sorted = [...new Set(days)].sort();
  const cutoff = defaultScheduleDay(sorted, today);
  if (cutoff == null) return sorted;
  // Once the season is over `defaultScheduleDay` returns the LAST night, so
  // this naturally becomes "everything" rather than collapsing to one chip.
  return sorted.filter((d) => d <= cutoff);
}
