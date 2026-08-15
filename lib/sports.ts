/**
 * What a sport calls things, and how its results work.
 *
 * The scheduling engine is sport-agnostic — nothing in `lib/scheduler`
 * references a sport at all. What differs between sports is vocabulary and
 * scoring, and both were previously hard-coded to volleyball across a few dozen
 * components ("Court 3", "Set 2", "Ref").
 *
 * Putting it here means adding the sport AFTER softball is a config entry
 * rather than another sweep through the UI. Pure data — no DB access — so a
 * label is never a reason to make a query.
 */

import type { Sport } from "@/lib/formats";

export interface SportConfig {
  /** What a playing surface is called. Volleyball courts, softball fields. */
  court: { one: string; many: string };
  /**
   * The unit a match is divided into. Volleyball plays sets; softball records
   * one final score, so its "set" is the game itself and is never shown.
   */
  period: { one: string; many: string };
  /** Who officiates. */
  official: { one: string; many: string };
  /**
   * Whether a match is made of several scored periods.
   *
   * False for softball: standings hide sets-won/lost and the set ratio, and
   * score entry asks for one score rather than a row per set.
   */
  hasPeriods: boolean;
  /**
   * What `pf` / `pa` are called in standings. `unit` is the singular noun used
   * in prose ("Run differential"), `short` the two column headers.
   */
  points: {
    for: string;
    against: string;
    short: [string, string];
    unit: string;
  };
}

const VOLLEYBALL: SportConfig = {
  court: { one: "Court", many: "Courts" },
  period: { one: "Set", many: "Sets" },
  official: { one: "Ref", many: "Refs" },
  hasPeriods: true,
  points: {
    for: "Points for",
    against: "Points against",
    short: ["PF", "PA"],
    unit: "Point",
  },
};

export const SPORT_CONFIG: Record<Sport, SportConfig> = {
  indoor6: VOLLEYBALL,
  beach2: VOLLEYBALL,
  coed4: VOLLEYBALL,
  softball: {
    // "Field" rather than "Diamond": a park's pitches are usually named (East,
    // West), and "Field East" reads better than "Diamond East".
    court: { one: "Field", many: "Fields" },
    period: { one: "Game", many: "Games" },
    official: { one: "Umpire", many: "Umpires" },
    hasPeriods: false,
    points: {
      for: "Runs for",
      against: "Runs against",
      short: ["RF", "RA"],
      unit: "Run",
    },
  },
};

export function sportConfig(sport: Sport): SportConfig {
  return SPORT_CONFIG[sport] ?? VOLLEYBALL;
}

/** Every word a stored court label might already begin with, across all sports. */
export const SURFACE_WORDS: string[] = [
  ...new Set(Object.values(SPORT_CONFIG).map((c) => c.court.one)),
];
