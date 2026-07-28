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
}

export interface TieredMatch {
  divisionId: string | null;
  round: number;
  /** "YYYY-MM-DD" game day. */
  date: string;
  /** 0-based game-of-the-night (drives the staggered start time). */
  wave: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** 1-based court number, assigned so same-instant games are always distinct. */
  courtIndex: number;
}

export interface TieredScheduleResult {
  matches: TieredMatch[];
  /** Most games any single time slot holds — > courts means courts double up. */
  maxGamesPerSlot: number;
}

export type TieredScheduleInput = Omit<
  RoundRobinInput,
  "teamIds" | "courts"
> & {
  /** Courts available per time slot across ALL tiers combined. */
  courts: number;
};

export function planTieredLeagueSchedule(
  tiers: LeagueTier[],
  input: TieredScheduleInput,
): TieredScheduleResult {
  // Generate each tier on the same calendar. A huge internal court count keeps
  // the per-tier generator from wrapping — we reassign courts globally below.
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
          round: m.round,
          date: r.date,
          wave: r.wave,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
        })),
      );
    });

  // Group by time slot (same date + wave = same instant) and hand out distinct
  // courts across the whole slot, so tiers sharing a night never collide.
  const bySlot = new Map<string, typeof games>();
  for (const g of games) {
    const key = `${g.date}#${g.wave}`;
    const list = bySlot.get(key);
    if (list) list.push(g);
    else bySlot.set(key, [g]);
  }

  const courts = Math.max(1, input.courts);
  let maxGamesPerSlot = 0;
  const matches: TieredMatch[] = [];
  for (const slot of bySlot.values()) {
    // Deterministic order within a slot: by division, then teams.
    slot.sort(
      (a, b) =>
        (a.divisionId ?? "").localeCompare(b.divisionId ?? "") ||
        a.homeTeamId.localeCompare(b.homeTeamId),
    );
    maxGamesPerSlot = Math.max(maxGamesPerSlot, slot.length);
    slot.forEach((g, i) => {
      matches.push({ ...g, courtIndex: (i % courts) + 1 });
    });
  }
  return { matches, maxGamesPerSlot };
}
