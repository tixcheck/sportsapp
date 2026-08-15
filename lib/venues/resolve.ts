/**
 * Where a game is played, once a competition can span several buildings.
 *
 * Pure — no DB access — so the rules are testable without a fixture. The rules
 * themselves are small but load-bearing, because court labels stop being unique
 * the moment a second venue exists: every school gym has a "Court A".
 */

import type { LeagueCourt } from "@/lib/db/schema";
import type { Sport } from "@/lib/formats";
import {
  formatCourtLabel,
  normalizeCourtLabel,
} from "@/lib/scheduler/court-label";

export type VenueSummary = {
  id: string;
  name: string;
  address: string | null;
  entryNotes: string | null;
  doorsNote: string | null;
};

/** The bit of a match this module needs. */
export type PlacedMatch = {
  court: string | null;
  /** Optional because `ScheduleMatch` carries it optionally for older callers. */
  venueId?: string | null;
};

/**
 * A court identified the only way that is unambiguous once venues exist.
 *
 * `venueId` null means the competition's single venue — the shape of every
 * competition that predates multi-venue support.
 */
export type CourtRef = { venueId: string | null; label: string };

/** Same physical court? Venue first, then the normalized label. */
export function sameCourtRef(a: CourtRef, b: CourtRef): boolean {
  if ((a.venueId ?? null) !== (b.venueId ?? null)) return false;
  const la = normalizeCourtLabel(a.label);
  const lb = normalizeCourtLabel(b.label);
  return la != null && lb != null && la.toLowerCase() === lb.toLowerCase();
}

/**
 * How a court reads to a player.
 *
 * With one venue the venue name is noise — the player knows where they are — so
 * it's omitted. With several it's the most important half: "Court A" alone is
 * useless when there are six of them across the city.
 */
export function formatPlacement(
  court: string | null | undefined,
  venueName: string | null | undefined,
  { multiVenue, sport }: { multiVenue: boolean; sport?: Sport },
): string | null {
  const courtText = formatCourtLabel(court, sport);
  const venue = venueName?.trim() || null;

  if (!multiVenue || !venue) return courtText;
  return courtText ? `${venue} · ${courtText}` : venue;
}

/**
 * Split a competition's court list by venue, in the order the venues are given.
 *
 * Courts with no venue land under `null`, which is how a partly-migrated league
 * looks while an organizer is still assigning gyms.
 */
export function courtsByVenue(
  courts: LeagueCourt[],
): Map<string | null, LeagueCourt[]> {
  const out = new Map<string | null, LeagueCourt[]>();
  for (const c of courts) {
    const key = c.venueId ?? null;
    const list = out.get(key);
    if (list) list.push(c);
    else out.set(key, [c]);
  }
  return out;
}

/** Distinct venues actually used by a set of matches, excluding unplaced ones. */
export function venuesInPlay(matches: PlacedMatch[]): Set<string> {
  const out = new Set<string>();
  for (const m of matches) if (m.venueId) out.add(m.venueId);
  return out;
}

/**
 * Does this competition genuinely run across more than one building?
 *
 * Deliberately measured against the SCHEDULE rather than the venue list: an
 * organizer may have three gyms on file and only be using one this season, and
 * prefixing every court with the same venue name in that case is clutter.
 */
export function isMultiVenue(matches: PlacedMatch[]): boolean {
  return venuesInPlay(matches).size > 1;
}

export type VenueGroup<T> = {
  venueId: string | null;
  venue: VenueSummary | null;
  matches: T[];
};

/**
 * Group a schedule by building, venues in the given order, unplaced last.
 *
 * An organizer running six gyms reads the night one gym at a time — that is how
 * the printed sheet is laid out, and how you staff a night.
 */
export function groupByVenue<T extends PlacedMatch>(
  matches: T[],
  venues: VenueSummary[],
): VenueGroup<T>[] {
  const order = new Map(venues.map((v, i) => [v.id, i]));
  const byId = new Map(venues.map((v) => [v.id, v]));

  const groups = new Map<string | null, T[]>();
  for (const m of matches) {
    const key = m.venueId ?? null;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  return [...groups.entries()]
    .map(([venueId, ms]) => ({
      venueId,
      venue: venueId ? (byId.get(venueId) ?? null) : null,
      matches: ms,
    }))
    .sort((a, b) => {
      // Unplaced games sort last — they're the ones needing attention, but they
      // aren't a building and shouldn't head the list.
      if (a.venueId === null) return 1;
      if (b.venueId === null) return -1;
      return (
        (order.get(a.venueId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.venueId) ?? Number.MAX_SAFE_INTEGER)
      );
    });
}

/** A maps link for a venue, or null when there's no address to point at. */
export function mapsUrl(venue: {
  name: string;
  address: string | null;
}): string | null {
  const q = venue.address?.trim() || null;
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${venue.name}, ${q}`,
  )}`;
}
