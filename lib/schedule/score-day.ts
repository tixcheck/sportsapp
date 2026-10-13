/**
 * Which night a scorekeeper's page opens on (0168): tonight if there are
 * games tonight, otherwise the next night with games, otherwise the last one
 * (a season that's over still shows its final night). Dates are local
 * "yyyy-MM-dd" strings in the league's timezone.
 */
export function pickScoreDay(dates: string[], today: string): string | null {
  const days = [...new Set(dates)].sort();
  if (days.length === 0) return null;
  if (days.includes(today)) return today;
  return days.find((d) => d > today) ?? days[days.length - 1];
}
