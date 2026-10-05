/**
 * Which start time a tier draws with in a given ladder week, when the league
 * swaps its early and late waves every few weeks.
 *
 * Mango Sports' Tuesday ladder: Tiers 1/3/5 at 19:00 and 2/4/6 at 21:00, and
 * "swap 7pm and 9pm tiers every 3 weeks" (2026-10-05). Weeks 1..N keep the
 * configured times, N+1..2N swap them, 2N+1..3N swap back, and so on — counted
 * in ladder weeks, so a blackout night doesn't eat into a block.
 *
 * Only a league with exactly TWO distinct start times has waves to swap. With
 * one there's nothing to trade; with three or more "swap" has no single
 * meaning, so the configured times stand rather than guessing a rotation.
 *
 * Pure: no DB.
 */
export function isSwappedWeek(week: number, every: number | null): boolean {
  if (!every || every < 1 || week < 1) return false;
  return Math.floor((week - 1) / every) % 2 === 1;
}

export function tierStartForWeek(
  start: string,
  allStarts: string[],
  week: number,
  every: number | null,
): string {
  if (!isSwappedWeek(week, every)) return start;
  const waves = [...new Set(allStarts)].sort();
  if (waves.length !== 2) return start;
  return start === waves[0] ? waves[1] : start === waves[1] ? waves[0] : start;
}
