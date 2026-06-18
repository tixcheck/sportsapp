/**
 * Score validation against a match format (PRD §6). Pure: no DB access.
 *
 * Three tiers, so an organizer override can bypass exactly the right ones:
 *  - errors:   impossible data (tied set, negative/non-integer). ALWAYS block,
 *              even an admin override can't record these.
 *  - blocks:   illegal-but-typed results that shouldn't normally complete a
 *              match — a set reaching target without a 2-point margin (21–20),
 *              or a match without a majority of sets. Block by default; an
 *              organizer may override (abandoned/injury).
 *  - warnings: genuinely-possible oddities (a time-capped 18–16, an overshoot)
 *              — surfaced but never blocking.
 */
import type { MatchFormat } from "@/lib/db/schema";

export interface SetScoreInput {
  home: number;
  away: number;
}

export interface ScoreValidation {
  /** True when the match is a valid, complete result (no errors and no blocks). */
  ok: boolean;
  /** Impossible data — blocks for everyone, override included. */
  errors: string[];
  /** Illegal/incomplete — blocks by default; an organizer override bypasses. */
  blocks: string[];
  /** Non-blocking oddities. */
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
  const blocks: string[] = [];
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
      // Short of target — only legitimate when time-capped. Allowed, flagged.
      warnings.push(
        `Set ${n}: winner reached ${win}, below the target of ${target}.`,
      );
    } else if (margin < format.winBy) {
      // Reached the target but not won by the margin — not a legal set ending.
      blocks.push(`Set ${n} must be won by ${format.winBy} points.`);
    } else if (win > target && margin > format.winBy) {
      warnings.push(`Set ${n}: ${win}–${lose} runs past the ${target} target.`);
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
    if (Math.max(homeSetsWon, awaySetsWon) < needed) {
      blocks.push(
        `Enter enough sets to decide the match (best of ${format.bestOf}).`,
      );
    }
    if (sets.length > format.bestOf) {
      warnings.push(`More sets entered than a best-of-${format.bestOf}.`);
    }
  }

  return {
    ok: errors.length === 0 && blocks.length === 0,
    errors,
    blocks,
    warnings,
    homeSetsWon,
    awaySetsWon,
    winner,
  };
}

/**
 * Whether a result may be finalized. Hard errors never finalize. Blocks finalize
 * only when an organizer/admin deliberately overrides (abandoned/injury). The
 * caller MUST pass the server-verified `isAdmin` — a client flag can't grant it.
 */
export function canFinalize(
  v: ScoreValidation,
  opts: { isAdmin: boolean; override: boolean },
): boolean {
  if (v.errors.length > 0) return false;
  return v.blocks.length === 0 || (opts.isAdmin && opts.override);
}
