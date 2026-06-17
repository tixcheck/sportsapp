/**
 * Score validation against a match format (PRD §6). Pure: no DB access.
 *
 * Philosophy (Phase 6): WARN, don't block, on unusual-but-real scores — a
 * time-capped set can legitimately end 18–16 or 23–25. Only genuinely
 * impossible data hard-blocks submission: a set with no winner (equal scores)
 * or negative / non-integer points.
 */
import type { MatchFormat } from "@/lib/db/schema";

export interface SetScoreInput {
  home: number;
  away: number;
}

export interface ScoreValidation {
  /** False if there's any hard error (submission blocked). */
  ok: boolean;
  errors: string[];
  warnings: string[];
  homeSetsWon: number;
  awaySetsWon: number;
  winner: "home" | "away" | null;
}

/** Points target for set index `i` (0-based) under the format. */
export function setTarget(format: MatchFormat, i: number): number {
  return (
    format.setsToPoints[i] ??
    format.setsToPoints[format.setsToPoints.length - 1] ??
    0
  );
}

export function validateScore(
  format: MatchFormat,
  sets: SetScoreInput[],
): ScoreValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let homeSetsWon = 0;
  let awaySetsWon = 0;

  sets.forEach((s, i) => {
    const n = i + 1;
    const target = setTarget(format, i);
    const intOk = Number.isInteger(s.home) && Number.isInteger(s.away);

    if (!intOk || s.home < 0 || s.away < 0) {
      errors.push(`Set ${n}: scores must be whole numbers of 0 or more.`);
      return;
    }
    if (s.home === s.away) {
      errors.push(`Set ${n}: a set can't end tied (${s.home}–${s.away}).`);
      return;
    }

    const winner = s.home > s.away ? "home" : "away";
    if (winner === "home") homeSetsWon += 1;
    else awaySetsWon += 1;

    const win = Math.max(s.home, s.away);
    const lose = Math.min(s.home, s.away);
    const margin = win - lose;

    if (win < target) {
      warnings.push(
        `Set ${n}: winner reached ${win}, below the target of ${target}.`,
      );
    } else if (win > target && margin > format.winBy) {
      warnings.push(`Set ${n}: ${win}–${lose} runs past the ${target} target.`);
    }
    if (margin < format.winBy) {
      warnings.push(
        `Set ${n}: won by ${margin} (less than win-by-${format.winBy}).`,
      );
    }
  });

  const winner =
    homeSetsWon > awaySetsWon
      ? "home"
      : awaySetsWon > homeSetsWon
        ? "away"
        : null;

  const needed = Math.ceil(format.bestOf / 2);
  if (errors.length === 0) {
    if (winner === null) {
      warnings.push("No match winner yet — the sets are tied.");
    } else if (Math.max(homeSetsWon, awaySetsWon) < needed) {
      warnings.push(
        `Match not decided — no side has reached ${needed} set${needed > 1 ? "s" : ""}.`,
      );
    }
    if (sets.length > format.bestOf) {
      warnings.push(`More sets entered than a best-of-${format.bestOf}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    homeSetsWon,
    awaySetsWon,
    winner,
  };
}
