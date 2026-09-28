/**
 * Standings points: 1 for a match won, ½ for a tie.
 *
 * The same value the OVA ranking sorts on first ("a tied game counts as ½ a
 * win", tiebreakers.ts) — shown as its own column because an organizer reading
 * MW and T separately has to do that sum in their head to see why the order is
 * what it is. Big Shoots asked for it by name.
 */
export function standingsPoints(row: { mw: number; mt: number }): number {
  return row.mw + row.mt / 2;
}

/** 4.5 stays 4.5; 4 is "4", not "4.0". */
export function formatStandingsPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
