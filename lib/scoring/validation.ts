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
  let tiedSets = 0;

  sets.forEach((s, i) => {
    const n = i + 1;
    const target = setTarget(format, i);
    const intOk = Number.isInteger(s.home) && Number.isInteger(s.away);

    if (!intOk || s.home < 0 || s.away < 0) {
      errors.push(`Set ${n}: scores must be whole numbers of 0 or more.`);
      return;
    }
    if (s.home === s.away) {
      if (!format.allowTie) {
        errors.push(`Set ${n}: a set can't end tied (${s.home}–${s.away}).`);
        return;
      }
      // A legal draw: neither side takes the set, and there is nothing else to
      // check — a tie has no winner, no margin and no target to measure.
      tiedSets += 1;
      return;
    }

    const winner = s.home > s.away ? "home" : "away";
    if (winner === "home") homeSetsWon += 1;
    else awaySetsWon += 1;

    const win = Math.max(s.home, s.away);
    const lose = Math.min(s.home, s.away);
    const margin = win - lose;

    const cap = format.capPoints;

    if (format.untargeted) {
      // Softball: seven innings or a clock, stopping wherever the score is.
      // There is no target to fall short of or run past, and no win-by margin.
      return;
    }

    if (cap != null && win > cap) {
      // Nothing can go past a hard ceiling — the set ends the moment it's hit.
      blocks.push(`Set ${n}: ${win}–${lose} goes past the cap of ${cap}.`);
    } else if (win < target) {
      // Short of target — only legitimate when time-capped. Allowed, flagged.
      warnings.push(
        `Set ${n}: winner reached ${win}, below the target of ${target}.`,
      );
    } else if (margin < format.winBy) {
      // At the cap the win-by rule is waived: 27–26 is exactly how a capped
      // set is meant to finish. Below the cap it's simply not a legal ending.
      if (cap == null || win !== cap) {
        blocks.push(`Set ${n} must be won by ${format.winBy} points.`);
      }
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

  // Even bestOf (2) = a fixed-set game: play exactly N sets, no majority needed,
  // and a 1–1 tie is a valid complete result. Odd = best-of majority.
  const fixedSets = format.bestOf % 2 === 0;
  if (errors.length === 0) {
    if (fixedSets) {
      if (sets.length !== format.bestOf) {
        blocks.push(
          `A ${format.bestOf}-set game must have exactly ${format.bestOf} sets.`,
        );
      }
    } else {
      const needed = Math.ceil(format.bestOf / 2);
      // A drawn game IS the result when the format permits draws — demanding a
      // winner would make every legal softball tie un-recordable.
      const settledByTie = format.allowTie && tiedSets === sets.length;
      if (!settledByTie && Math.max(homeSetsWon, awaySetsWon) < needed) {
        blocks.push(
          `Enter enough sets to decide the match (best of ${format.bestOf}).`,
        );
      }
      if (sets.length > format.bestOf) {
        warnings.push(`More sets entered than a best-of-${format.bestOf}.`);
      }
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

export interface SetValidation {
  status: "ok" | "warn" | "reject";
  message?: string;
}

/**
 * Validate a single set for the per-set "Record" action — same tiers as
 * validateScore: reject impossible data or a target reached without the win-by
 * margin (21–20); warn (but accept) a below-target capped set or an overshoot.
 */
export function validateSet(
  format: MatchFormat,
  i: number,
  s: SetScoreInput,
): SetValidation {
  const target = setTarget(format, i);
  if (
    !Number.isInteger(s.home) ||
    !Number.isInteger(s.away) ||
    s.home < 0 ||
    s.away < 0
  ) {
    return {
      status: "reject",
      message: "Scores must be whole numbers of 0 or more.",
    };
  }
  if (s.home === s.away) {
    // Volleyball sets cannot tie. A softball regular-season game can finish
    // level; its playoff games clear `allowTie` and go to extra innings.
    return format.allowTie
      ? { status: "ok" }
      : { status: "reject", message: "This game can't end tied." };
  }
  const win = Math.max(s.home, s.away);
  const lose = Math.min(s.home, s.away);
  const margin = win - lose;
  const cap = format.capPoints;
  if (cap != null && win > cap) {
    return { status: "reject", message: `Goes past the cap of ${cap}.` };
  }
  // An untargeted game (softball: seven innings or a clock) stops wherever the
  // score is, so "below the target" and "past the target" are both meaningless.
  // Without this every blowout warns against a target that doesn't exist.
  if (format.untargeted) {
    return { status: "ok" };
  }
  if (win < target) {
    return { status: "warn", message: `Below the target of ${target}.` };
  }
  // A cap finish (27–26) waives the win-by rule; below the cap it doesn't.
  if (margin < format.winBy && !(cap != null && win === cap)) {
    return {
      status: "reject",
      message: `Set must be won by ${format.winBy} points.`,
    };
  }
  if (win > target && margin > format.winBy) {
    return {
      status: "warn",
      message: `${win}–${lose} runs past the ${target} target.`,
    };
  }
  return { status: "ok" };
}

/**
 * Match decision from the currently-recorded sets — pure, so the form's submit
 * gate and grey-out both derive from live state (no latch). `decided` is true
 * once a team has the majority for the format's bestOf.
 */
export function recordedDecision(
  recorded: SetScoreInput[],
  bestOf: number,
): { decided: boolean; homeSetsWon: number; awaySetsWon: number } {
  let homeSetsWon = 0;
  let awaySetsWon = 0;
  for (const s of recorded) {
    if (s.home > s.away) homeSetsWon += 1;
    else if (s.away > s.home) awaySetsWon += 1;
  }
  // Fixed-set (even bestOf): decided once all N sets are in (a 1–1 is decided).
  // Best-of (odd): decided once a team has the majority.
  const decided =
    bestOf % 2 === 0
      ? recorded.length >= bestOf
      : Math.max(homeSetsWon, awaySetsWon) >= Math.ceil(bestOf / 2);
  return { decided, homeSetsWon, awaySetsWon };
}
