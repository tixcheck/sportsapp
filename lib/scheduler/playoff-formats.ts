/**
 * Named playoff formats an organizer picks from, and the one night each plays.
 *
 * Built for Big Shoots, which re-drafts four teams every three Fridays and
 * ends each block with a playoff night. Their organizer's words: "seed 1 vs
 * seed 4 and seed 2 vs seed 3, best of 3. Then winner vs winner final (best of
 * 3) and loser vs loser 3/4 match (best of 3)." That is Playoff Format 1. The
 * list is here so the next shape an organizer describes is an entry, not a new
 * generator — and so the organizer chooses it by name rather than by building
 * it from toggles every session.
 *
 * A format's games are written in bracket coordinates (round, position) that
 * `place_bracket_winner` already understands: a semi's winner climbs to
 * (round + 1, ceil(position / 2)), and a semi's loser drops into position 2 of
 * the final round — the 3rd-place game. Nothing here advances anybody; the
 * database does, which is why the coordinates matter.
 *
 * Pure: no DB, no clock.
 */
import { DateTime } from "luxon";

import type { MatchFormat } from "@/lib/db/schema";

/** A side of a game: a seed, or nobody yet (filled when a feeder finishes). */
export type PlayoffSide = { seed: number } | null;

export interface PlayoffGameSpec {
  round: number;
  position: number;
  /** 0-based time slot on the night. */
  wave: number;
  /** 0-based index into the night's courts. */
  court: number;
  home: PlayoffSide;
  away: PlayoffSide;
  /** What the game is called on the schedule. */
  label: string;
}

export interface PlayoffFormat {
  id: string;
  label: string;
  description: string;
  /** Exactly this many teams are seeded into it. */
  teams: number;
  /** How many courts it needs at once. */
  courts: number;
  /** Sets per game. The set length comes from the league's own format. */
  bestOf: MatchFormat["bestOf"];
  /**
   * The deciding set's target, when it is shorter than the rest — Big Shoots
   * plays its third set to 15. Absent = the league's own set length throughout.
   */
  decidingSetTo?: number;
  /** A sensible slot for one game, which the organizer can change. */
  defaultSlotMinutes: number;
  games: PlayoffGameSpec[];
}

const s = (seed: number): PlayoffSide => ({ seed });

export const PLAYOFF_FORMATS: PlayoffFormat[] = [
  {
    id: "format-1",
    label: "Playoff Format 1",
    description:
      "Four teams, one night, best of 3 throughout (a third set, if needed, to 15). Semi-finals: seed 1 v seed 4 and seed 2 v seed 3. Then the two winners play the final and the two losers play for 3rd place, side by side.",
    teams: 4,
    courts: 2,
    bestOf: 3,
    decidingSetTo: 15,
    defaultSlotMinutes: 60,
    games: [
      {
        round: 1,
        position: 1,
        wave: 0,
        court: 0,
        home: s(1),
        away: s(4),
        label: "Semi-final 1",
      },
      {
        round: 1,
        position: 2,
        wave: 0,
        court: 1,
        home: s(2),
        away: s(3),
        label: "Semi-final 2",
      },
      {
        round: 2,
        position: 1,
        wave: 1,
        court: 0,
        home: null,
        away: null,
        label: "Final",
      },
      {
        round: 2,
        position: 2,
        wave: 1,
        court: 1,
        home: null,
        away: null,
        label: "3rd place",
      },
    ],
  },
];

export function playoffFormat(id: string): PlayoffFormat | null {
  return PLAYOFF_FORMATS.find((f) => f.id === id) ?? null;
}

/**
 * The format's match format: its number of sets at the league's own set length
 * and rules, with the format's shorter deciding set where it names one. Big
 * Shoots plays sets to 25 capped at 27, and a third set to 15.
 */
export function playoffMatchFormat(
  format: PlayoffFormat,
  league: MatchFormat,
): MatchFormat {
  const setTo = league.setsToPoints?.[0] ?? 25;
  return {
    ...league,
    bestOf: format.bestOf,
    setsToPoints: Array.from({ length: format.bestOf }, (_, i) =>
      i === format.bestOf - 1 && format.decidingSetTo
        ? format.decidingSetTo
        : setTo,
    ),
  };
}

export interface PlannedPlayoffGame {
  round: number;
  position: number;
  label: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  court: string;
  /** ISO instant. */
  scheduledAt: string;
}

/**
 * Lay a format out on a night.
 *
 * `seeds` is best first: seeds[0] is seed 1. Throws on a field of the wrong
 * size or too few courts — a playoff night drawn wrong is worse than one not
 * drawn, because the teams read it and turn up.
 */
export function planPlayoffNight(
  format: PlayoffFormat,
  seeds: string[],
  night: {
    date: string;
    startTime: string;
    slotMinutes: number;
    zone: string;
    courts: string[];
  },
): PlannedPlayoffGame[] {
  if (seeds.length !== format.teams) {
    throw new Error(
      `${format.label} needs exactly ${format.teams} teams; ${seeds.length} were seeded.`,
    );
  }
  if (new Set(seeds).size !== seeds.length) {
    throw new Error("A team can only take one seed.");
  }
  if (night.courts.length < format.courts) {
    throw new Error(
      `${format.label} needs ${format.courts} courts at once; this league has ${night.courts.length}.`,
    );
  }
  const start = DateTime.fromISO(`${night.date}T${night.startTime}`, {
    zone: night.zone,
  });
  if (!start.isValid) throw new Error("That date or start time isn't valid.");

  const team = (side: PlayoffSide) => (side ? seeds[side.seed - 1] : null);
  return format.games.map((g) => ({
    round: g.round,
    position: g.position,
    label: g.label,
    homeTeamId: team(g.home),
    awayTeamId: team(g.away),
    court: night.courts[g.court],
    scheduledAt: start.plus({ minutes: g.wave * night.slotMinutes }).toISO()!,
  }));
}

/**
 * The nights whose results seed a playoff on `playoffNight`.
 *
 * The earlier nights of the playoff's own session — the block of nights the
 * same drafted teams played together. Big Shoots' Team 1 is different people
 * every session, so its season record says nothing about who should be seed 1
 * tonight. Without sessions, every earlier night counts.
 */
export function seedingNights(
  nights: string[],
  sessionNights: number | null,
  playoffNight: string,
): string[] {
  const ordered = [...new Set(nights)].sort();
  const before = ordered.filter((n) => n < playoffNight);
  if (sessionNights == null || sessionNights < 2) return before;
  const index = ordered.indexOf(playoffNight);
  if (index < 0) return before;
  const sessionStart = index - (index % sessionNights);
  return ordered.slice(sessionStart, index);
}
