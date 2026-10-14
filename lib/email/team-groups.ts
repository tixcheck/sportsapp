/**
 * Ready-made team selections for an organizer message: "everyone playing at
 * Terry Miller on Thu Oct 15". Pure — the caller passes the upcoming games.
 *
 * BVL, 2026-10-14: a gym's times moved and only the teams in that gym needed
 * telling. A gym on a night is how organizers think about who is affected, so
 * it is offered as one tap instead of ticking 11 names out of 55.
 *
 * A game with an empty seat (an alignment climber, decided on the night) adds
 * only the team it has; the climbers come from earlier sessions in the same
 * gym, so they are in the group already.
 */
export type GroupGame = {
  venue: string | null;
  /** League-local date, yyyy-mm-dd. */
  date: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export type TeamGroup = {
  /** "Terry Miller Recreation Centre · Thu Oct 15" */
  label: string;
  date: string;
  teamIds: string[];
};

export function teamGroupsFromGames(games: GroupGame[]): TeamGroup[] {
  const byKey = new Map<
    string,
    { venue: string; date: string; ids: Set<string> }
  >();
  for (const g of games) {
    if (!g.venue) continue;
    const key = `${g.date}|${g.venue}`;
    const entry =
      byKey.get(key) ??
      byKey
        .set(key, { venue: g.venue, date: g.date, ids: new Set() })
        .get(key)!;
    if (g.homeTeamId) entry.ids.add(g.homeTeamId);
    if (g.awayTeamId) entry.ids.add(g.awayTeamId);
  }
  return [...byKey.values()]
    .filter((e) => e.ids.size > 0)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue),
    )
    .map((e) => ({
      label: `${e.venue} · ${nightLabel(e.date)}`,
      date: e.date,
      teamIds: [...e.ids],
    }));
}

function nightLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
