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
   * Positions a free agent can say they're comfortable in, in the order a
   * player reads them. EMPTY means this sport has no position question and the
   * sign-up form omits it — better than inventing terminology for a sport
   * nobody has confirmed the roles for.
   */
  positions: string[];
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

/**
 * Indoor 6s and co-ed 4s positions. Beach 2s deliberately does NOT get these:
 * its roles are blocker and defender, and offering a 2s player "Middle Blocker"
 * would be worse than asking nothing.
 */
const INDOOR_POSITIONS = [
  "Outside Hitter",
  "Middle Blocker",
  "Setter",
  "Right Side Hitter",
  "Libero",
];

const VOLLEYBALL: SportConfig = {
  court: { one: "Court", many: "Courts" },
  period: { one: "Set", many: "Sets" },
  official: { one: "Ref", many: "Refs" },
  hasPeriods: true,
  positions: INDOOR_POSITIONS,
  points: {
    for: "Points for",
    against: "Points against",
    short: ["PF", "PA"],
    unit: "Point",
  },
};

export const SPORT_CONFIG: Record<Sport, SportConfig> = {
  indoor6: VOLLEYBALL,
  beach2: { ...VOLLEYBALL, positions: [] },
  coed4: VOLLEYBALL,
  softball: {
    // "Field" rather than "Diamond": a park's pitches are usually named (East,
    // West), and "Field East" reads better than "Diamond East".
    court: { one: "Field", many: "Fields" },
    period: { one: "Game", many: "Games" },
    official: { one: "Umpire", many: "Umpires" },
    hasPeriods: false,
    // No list yet — softball's positions would be invented, not confirmed.
    positions: [],
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

/**
 * How strong a player says they are, weakest first. Mirrors the `skill_level`
 * enum in migration 0076: these values ARE the DB values, and this order is the
 * order the sign-up form offers them.
 */
export const SKILL_LEVELS = [
  { value: "rec", label: "Rec" },
  { value: "rec_intermediate", label: "Rec Intermediate" },
  { value: "intermediate", label: "Intermediate" },
  { value: "competitive", label: "Competitive" },
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number]["value"];

export function skillLabel(level: SkillLevel): string {
  return SKILL_LEVELS.find((l) => l.value === level)?.label ?? level;
}

/** Whether this sport asks a free agent which positions they play. */
export function hasPositions(sport: Sport): boolean {
  return sportConfig(sport).positions.length > 0;
}
