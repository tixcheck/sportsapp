import type { LeagueCourt } from "@/lib/db/schema";

/**
 * Courts as a COUNT per gym, rather than a pool you assign one at a time.
 *
 * The storage was always per-venue — `LeagueCourt.venueId`, and the schema is
 * explicit that a court is identified by (venueId, label) because "Court A"
 * exists at every gym. The editor was the part that had it backwards: a flat
 * list of courts, each with its own building dropdown, so setting up an
 * eight-gym league meant twenty-odd individual assignments to express "Bethune
 * has three courts, Leacock has two".
 *
 * Nobody thinks about it that way. A gym has a number of courts. So the count
 * is the thing edited, and the court rows are derived from it.
 *
 * Pure: no DB, no React.
 */

/** How many courts each venue has. Keyed by venue id; "" is the unassigned pile. */
export function countByVenue(courts: LeagueCourt[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of courts) {
    const key = c.venueId ?? "";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** The courts belonging to one venue, in their existing order. */
export function courtsAt(
  courts: LeagueCourt[],
  venueId: string | null,
): LeagueCourt[] {
  return courts.filter((c) => (c.venueId ?? null) === venueId);
}

/**
 * The smallest positive integer label not already used AT THIS VENUE.
 *
 * Scoped to the venue because labels only have to be unique there — every gym
 * having a Court 1 is normal and is what people call them. A label that isn't
 * a number (an organizer typed "Centre") is left alone and simply doesn't
 * occupy a number.
 */
function nextLabel(existing: LeagueCourt[]): string {
  const used = new Set(
    existing
      .map((c) => Number(c.label))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return String(n);
}

/**
 * Set how many courts a venue has, returning the whole new court list.
 *
 * Growing appends; shrinking removes from the END. Removing the last-added is
 * the only defensible choice without asking: a court in the middle may be
 * carrying a `prime` flag or already be on a published schedule, and silently
 * dropping the one somebody labelled "3" because it sorted last would be worse.
 *
 * Courts at other venues are untouched and keep their relative order, so
 * editing one gym never reshuffles another.
 */
export function setVenueCourtCount(
  courts: LeagueCourt[],
  venueId: string | null,
  count: number,
): LeagueCourt[] {
  const target = Math.max(0, Math.floor(count));
  const mine = courtsAt(courts, venueId);
  const others = courts.filter((c) => (c.venueId ?? null) !== venueId);

  if (target === mine.length) return [...courts];

  let next: LeagueCourt[];
  if (target < mine.length) {
    next = mine.slice(0, target);
  } else {
    next = [...mine];
    while (next.length < target) {
      next.push({ label: nextLabel(next), prime: false, venueId });
    }
  }

  // Rebuild in the original order so the list doesn't jump around as it is
  // edited: every venue's block stays where it was.
  const out: LeagueCourt[] = [];
  let inserted = false;
  for (const c of courts) {
    if ((c.venueId ?? null) === venueId) {
      if (!inserted) {
        out.push(...next);
        inserted = true;
      }
      continue;
    }
    out.push(c);
  }
  if (!inserted) out.push(...next);
  void others;
  return out;
}

/** Flip the prime flag on one court at one venue. */
export function togglePrime(
  courts: LeagueCourt[],
  venueId: string | null,
  label: string,
): LeagueCourt[] {
  return courts.map((c) =>
    (c.venueId ?? null) === venueId && c.label === label
      ? { ...c, prime: !c.prime }
      : c,
  );
}

/**
 * Total courts across every venue — what the generator has to play with.
 */
export function totalCourts(courts: LeagueCourt[]): number {
  return courts.length;
}
