/**
 * Tiered league scheduling (PRD: league "tiers" = separate mini-leagues). Pure:
 * no DB access.
 *
 * Each tier plays its OWN round robin — teams only ever meet others in their tier
 * — but all tiers share the same weekly calendar and the same court pool. We
 * generate each tier's schedule on the identical calendar (so their game nights
 * line up), then assign courts GLOBALLY per time slot so two tiers never claim
 * the same court at the same moment. A single-tier (or untiered) league is just
 * one group and behaves exactly like the flat generator.
 */

import {
  generateRoundRobin,
  type RoundRobinInput,
  type TeamId,
} from "./round-robin";

export interface LeagueTier {
  /** The division id this tier maps to (null for an untiered league). */
  divisionId: string | null;
  teamIds: TeamId[];
  /**
   * The building this tier plays in (slice two). Null = the competition's
   * single venue, which is every league that predates multi-venue support.
   */
  venueId?: string | null;
}

/** Capacity at one building for a night. */
export interface VenueCapacity {
  venueId: string | null;
  /** Courts usable at THIS venue per time slot. */
  courts: number;
}

export interface TieredMatch {
  divisionId: string | null;
  /** The building this game is in. Null = the competition's single venue. */
  venueId: string | null;
  round: number;
  /** "YYYY-MM-DD" game day. */
  date: string;
  /** 0-based game-of-the-night (drives the staggered start time). */
  wave: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /**
   * 1-based court number WITHIN ITS VENUE. Two games can share a court number
   * when they're in different buildings — that is the point, and why the venue
   * has to be read alongside it.
   */
  courtIndex: number;
}

export interface TieredScheduleResult {
  matches: TieredMatch[];
  /** Most games any single time slot holds — > courts means courts double up. */
  maxGamesPerSlot: number;
  /**
   * Venues asked to host more simultaneous games than they have courts, with
   * the worst slot seen. Empty when everything fits. The generator still emits
   * a schedule (wrapping court numbers, as it always has) — this is what lets
   * the caller warn instead of silently double-booking a gym.
   */
  overCapacity: { venueId: string | null; courts: number; needed: number }[];
}

export type TieredScheduleInput = Omit<
  RoundRobinInput,
  "teamIds" | "courts"
> & {
  /** Courts per time slot across ALL tiers — used when there are no venues. */
  courts: number;
  /**
   * Per-building capacity (slice two). When given, courts are handed out
   * WITHIN each venue rather than from one global pool. Omit for a
   * single-venue league and the old behaviour is preserved exactly.
   */
  venues?: VenueCapacity[];
};

export function planTieredLeagueSchedule(
  tiers: LeagueTier[],
  input: TieredScheduleInput,
): TieredScheduleResult {
  // Generate each tier on the same calendar. A huge internal court count keeps
  // the per-tier generator from wrapping — we reassign courts below.
  const games = tiers
    .filter((t) => t.teamIds.length >= 2)
    .flatMap((t) => {
      const { rounds } = generateRoundRobin({
        ...input,
        teamIds: t.teamIds,
        courts: 9999,
      });
      return rounds.flatMap((r) =>
        r.matches.map((m) => ({
          divisionId: t.divisionId,
          venueId: t.venueId ?? null,
          round: m.round,
          date: r.date,
          wave: r.wave,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
        })),
      );
    });

  // Courts belong to buildings. Grouping by venue as well as by instant is the
  // whole of slice two: without it a six-gym night draws court numbers from one
  // pool and puts two games on the same physical court.
  const capacityByVenue = new Map<string | null, number>(
    (input.venues ?? []).map((v) => [v.venueId ?? null, Math.max(1, v.courts)]),
  );
  const globalCourts = Math.max(1, input.courts);

  const bySlot = new Map<string, typeof games>();
  for (const g of games) {
    // A single-venue league has one null venue, so this key collapses to the
    // old date#wave grouping and the behaviour is unchanged.
    const key = `${g.venueId ?? ""}#${g.date}#${g.wave}`;
    const list = bySlot.get(key);
    if (list) list.push(g);
    else bySlot.set(key, [g]);
  }

  let maxGamesPerSlot = 0;
  const worstNeed = new Map<string | null, number>();
  const matches: TieredMatch[] = [];

  for (const slot of bySlot.values()) {
    // Deterministic order within a slot: by division, then teams.
    slot.sort(
      (a, b) =>
        (a.divisionId ?? "").localeCompare(b.divisionId ?? "") ||
        a.homeTeamId.localeCompare(b.homeTeamId),
    );
    maxGamesPerSlot = Math.max(maxGamesPerSlot, slot.length);

    const venueId = slot[0]?.venueId ?? null;
    const courts = capacityByVenue.get(venueId) ?? globalCourts;
    worstNeed.set(venueId, Math.max(worstNeed.get(venueId) ?? 0, slot.length));

    slot.forEach((g, i) => {
      matches.push({ ...g, courtIndex: (i % courts) + 1 });
    });
  }

  // Wrapping court numbers is the long-standing fallback, but silently is what
  // makes it dangerous: an organizer assigning four divisions to a three-court
  // gym gets a schedule that looks fine and double-books a court all night.
  const overCapacity = [...worstNeed.entries()]
    .map(([venueId, needed]) => ({
      venueId,
      courts: capacityByVenue.get(venueId) ?? globalCourts,
      needed,
    }))
    .filter((v) => v.needed > v.courts)
    .sort((a, b) => b.needed - b.courts - (a.needed - a.courts));

  return { matches, maxGamesPerSlot, overCapacity };
}
