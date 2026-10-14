/**
 * What the nightly ladder job should do with a league (0171). Pure: no DB, no
 * clock — `today` is the league's local date, passed in.
 *
 * The job never decides whether a week is READY; the lock does, with the same
 * checks the Ladder tab's button runs (every game scored, or a tier's
 * standings typed in full). This only decides whether it's worth asking:
 *
 * - "start": nothing drawn yet. Week 1 is the organizer's call (tiers, seeds,
 *   start date), so the job leaves it alone.
 * - "draw": the latest week has placements but no games — locked by hand
 *   without a draw, or a draw that failed last night.
 * - "wait": the week's last night hasn't finished yet (it's today or later).
 * - "lock": the night is over; try the lock, and draw the next week if it
 *   takes.
 */
export type AdvanceStep = "start" | "draw" | "wait" | "lock";

export function nextAdvanceStep(input: {
  latestWeek: number;
  /** League-local dates (yyyy-mm-dd) of the latest week's games. */
  gameDates: string[];
  /** League-local date today. */
  today: string;
}): AdvanceStep {
  if (input.latestWeek < 1) return "start";
  if (input.gameDates.length === 0) return "draw";
  const lastNight = input.gameDates.reduce((a, b) => (b > a ? b : a));
  return lastNight < input.today ? "lock" : "wait";
}

/**
 * Whether a drawn game falls after the season. The draw counts playing nights
 * forward with no end in sight, so after the final week the job would draw a
 * night that isn't booked; those games are removed again.
 */
export function afterSeason(gameDate: string, endDate: string | null): boolean {
  return endDate != null && gameDate > endDate;
}
