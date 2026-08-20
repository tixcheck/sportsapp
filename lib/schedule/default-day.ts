/**
 * Which day a schedule should open on. Pure: no clock, no DB.
 *
 * "All days" is the right default for an organizer auditing a season, and the
 * wrong one for a player. Someone opening a public schedule is nearly always
 * asking one question — *when do I play next* — and answering it with the whole
 * season means scrolling past nights that have already happened.
 *
 * So: the next night that hasn't finished, today included. Game day is exactly
 * when the schedule gets opened most, and a night is still "next" while it's
 * being played. Once the season is over there is no next night, and the most
 * recent one is the useful answer instead — that's the night people are looking
 * up results for.
 *
 * `today` is passed in rather than read from the clock so this is testable and,
 * more importantly, so the caller resolves it in the COMPETITION's timezone. A
 * league in Toronto opening at 11pm Vancouver time must still be on tonight.
 */

/**
 * @param days Playing days as `yyyy-MM-dd`, any order.
 * @param today `yyyy-MM-dd` in the competition's timezone.
 * @returns The day to select, or null when nothing is scheduled.
 */
export function defaultScheduleDay(
  days: string[],
  today: string,
): string | null {
  if (days.length === 0) return null;
  // Lexicographic order is chronological for yyyy-MM-dd, which is the whole
  // reason the day keys are formatted that way.
  const sorted = [...new Set(days)].sort();
  return sorted.find((d) => d >= today) ?? sorted[sorted.length - 1];
}
