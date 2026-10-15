/**
 * Which tournaments the dashboard promotes (2026-10-14).
 *
 * Only ones a player can actually enter right now: registration open, deadline
 * not passed, not started, room left, and not one they're already in. A
 * "Register" button that ends at "Registration closed" does more harm than an
 * empty strip, so anything doubtful is left out. Pure — the caller passes the
 * rows and the clock.
 */
export type PromoCandidate = {
  id: string;
  name: string;
  slug: string;
  sport: string;
  orgName: string;
  venue: string | null;
  /** yyyy-mm-dd, the event's own local date. */
  startDate: string | null;
  /** ISO timestamp. */
  deadline: string | null;
  /** The event's IANA zone, for showing the deadline in local time. */
  timezone: string;
  maxTeams: number | null;
  spotsTaken: number;
};

export type PromotedTournament = PromoCandidate & {
  /** Null when the organizer set no cap. */
  spotsLeft: number | null;
};

export function pickPromotedTournaments(
  rows: PromoCandidate[],
  opts: { now: Date; excludeIds: Set<string>; limit: number },
): PromotedTournament[] {
  const today = opts.now.toISOString().slice(0, 10);
  return rows
    .filter((r) => !opts.excludeIds.has(r.id))
    .filter((r) => !r.deadline || new Date(r.deadline) > opts.now)
    .filter((r) => !r.startDate || r.startDate >= today)
    .map((r) => ({
      ...r,
      spotsLeft:
        r.maxTeams === null ? null : Math.max(0, r.maxTeams - r.spotsTaken),
    }))
    .filter((r) => r.spotsLeft === null || r.spotsLeft > 0)
    .sort(
      (a, b) =>
        // Soonest to close first: that's the one a player can miss.
        cmpNullsLast(a.deadline, b.deadline) ||
        cmpNullsLast(a.startDate, b.startDate) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, opts.limit);
}

function cmpNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/** "6 of 16 spots left", "Last spot", or null when uncapped. */
export function spotsLine(t: PromotedTournament): string | null {
  if (t.spotsLeft === null || t.maxTeams === null) return null;
  if (t.spotsLeft === 1) return "Last spot";
  return `${t.spotsLeft} of ${t.maxTeams} spots left`;
}
