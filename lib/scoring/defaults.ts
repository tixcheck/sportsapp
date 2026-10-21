/**
 * Defaults (no-shows), 0183. Pure: no DB access.
 *
 * BVL's rule (2026-10-20): in a defaulted set the team that defaulted scores 0
 * and the other team scores the set's target (25). When both teams default
 * the game, it's a loss for both and 0 points for either.
 */
import type { MatchFormat } from "@/lib/db/schema";
import { setTarget, type SetScoreInput } from "./validation";

export type DefaultedBy = "home" | "away";

/** A set as entered: the score, and who defaulted it if anyone did. */
export interface EnteredSet extends SetScoreInput {
  defaultedBy?: DefaultedBy | null;
}

export const isDefaultedBy = (v: unknown): v is DefaultedBy =>
  v === "home" || v === "away";

/** The score a defaulted set is stored as: target to the other side, 0 to the defaulter. */
export function defaultedSetScore(
  format: MatchFormat,
  index: number,
  side: DefaultedBy,
): SetScoreInput {
  const target = setTarget(format, index);
  return side === "home"
    ? { home: 0, away: target }
    : { home: target, away: 0 };
}

/**
 * The first problem with the defaults in `sets`, or null. A set marked
 * defaulted must carry exactly the default score, so the mark can never
 * disagree with what the standings read.
 */
export function defaultProblem(
  format: MatchFormat,
  sets: EnteredSet[],
): string | null {
  for (const [i, s] of sets.entries()) {
    if (s.defaultedBy == null) continue;
    if (!isDefaultedBy(s.defaultedBy)) return `Set ${i + 1}: unknown default.`;
    const want = defaultedSetScore(format, i, s.defaultedBy);
    if (s.home !== want.home || s.away !== want.away) {
      return `Set ${i + 1} is marked as a default, so it must be ${want.home}–${want.away}.`;
    }
  }
  return null;
}

/** "Set 2: Lions defaulted", for the audit trail. */
export function describeDefaults(
  sets: EnteredSet[],
  homeTeamName: string,
  awayTeamName: string,
): string[] {
  return sets.flatMap((s, i) =>
    s.defaultedBy
      ? [
          `Set ${i + 1}: ${s.defaultedBy === "home" ? homeTeamName : awayTeamName} defaulted`,
        ]
      : [],
  );
}
