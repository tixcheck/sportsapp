/**
 * King of the Court — pure live-scoring state machine (no DB, no UI).
 *
 * A pool plays a session of `roundsPerSession` timed rounds. The King side scores
 * a point on a King win; a challenger win promotes the challenger (no point); a
 * challenger serve error keeps the King on court but scores no point. In every
 * case the beaten/erring challenger goes to the back of the rotation queue and the
 * next team steps in.
 *
 * Round transition (round_end): rank the just-finished round, then re-seed the
 * next round's lineup by those standings — 1st = King, 2nd = challenger, the rest
 * queue in order — and reset per-round points to 0. Cumulative points carry across
 * all rounds and feed the pool result / seed.
 *
 * The reducer is pure and deterministic so it can run server-side (rebuild
 * standings from the event log) and client-side (instant optimistic scoring).
 */

import {
  rankKotcPool,
  type KotcPoolResult,
  type KotcStandingRow,
  type TeamId,
} from "./ranking";

export interface KotcConfig {
  /** Timed rounds per pool session (e.g. 3). */
  roundsPerSession: number;
  /** A round may end when a pair reaches this many King points (null = time-only). */
  pointCap: number | null;
}

export type KotcEvent =
  | { type: "rally"; winnerSide: "king" | "challenger" }
  // Challenger missed their serve: no point, the King holds, the challenger
  // rotates to the back of the queue and the next challenger serves.
  | { type: "serve_error" }
  | { type: "round_end" }
  | { type: "void" };

/** A tap that can be undone by a `void` (a rally or a serve error). */
function isUndoableTap(e: KotcEvent): boolean {
  return e.type === "rally" || e.type === "serve_error";
}

export interface KotcState {
  /** Full pool membership as a stable set (order = initial seed order; it is NOT
   * the live lineup — king/challenger/queue track that). Used to iterate pairs
   * when building per-round and cumulative results. */
  roster: TeamId[];
  kingTeamId: TeamId;
  challengerTeamId: TeamId;
  queue: TeamId[];
  roundIndex: number;
  status: "in_progress" | "complete";
  /** Monotonic rally counter across the whole session. */
  seq: number;
  // --- per-round (reset on round_end) ---
  roundPoints: Record<TeamId, number>;
  /** Current King streak this round (resets when a King is dethroned). */
  roundStreak: Record<TeamId, number>;
  roundLongest: Record<TeamId, number>;
  roundReachedSeq: Record<TeamId, number | null>;
  // --- cumulative (across rounds) ---
  totalPoints: Record<TeamId, number>;
  totalLongest: Record<TeamId, number>;
  totalReachedSeq: Record<TeamId, number | null>;
}

function zero(roster: TeamId[]): Record<TeamId, number> {
  return Object.fromEntries(roster.map((t) => [t, 0]));
}
function nulls(roster: TeamId[]): Record<TeamId, number | null> {
  return Object.fromEntries(roster.map((t) => [t, null]));
}

/** Initial state: King = seed 0, challenger = seed 1, the rest queue in order. */
export function initKotcPool(pairOrder: TeamId[]): KotcState {
  if (pairOrder.length < 2) {
    throw new Error("A KotC pool needs at least 2 pairs.");
  }
  const roster = [...pairOrder];
  return {
    roster,
    kingTeamId: pairOrder[0],
    challengerTeamId: pairOrder[1],
    queue: pairOrder.slice(2),
    roundIndex: 0,
    status: "in_progress",
    seq: 0,
    roundPoints: zero(roster),
    roundStreak: zero(roster),
    roundLongest: zero(roster),
    roundReachedSeq: nulls(roster),
    totalPoints: zero(roster),
    totalLongest: zero(roster),
    totalReachedSeq: nulls(roster),
  };
}

/** Per-pair results for the CURRENT round (drives the round-end re-seed). */
export function roundResults(s: KotcState): KotcPoolResult[] {
  return s.roster.map((t) => ({
    teamId: t,
    kingPoints: s.roundPoints[t],
    longestStreak: s.roundLongest[t],
    reachedSeq: s.roundReachedSeq[t],
  }));
}

/** Per-pair results across the whole session (drives the seed). */
export function overallResults(s: KotcState): KotcPoolResult[] {
  return s.roster.map((t) => ({
    teamId: t,
    kingPoints: s.totalPoints[t],
    longestStreak: s.totalLongest[t],
    reachedSeq: s.totalReachedSeq[t],
  }));
}

/** Final pool standings (cumulative), ranked by the KotC tiebreaker. */
export function poolStandings(s: KotcState): KotcStandingRow[] {
  return rankKotcPool(overallResults(s));
}

/** True when a pair has hit the configured per-round King-point cap. */
export function isRoundComplete(s: KotcState, config: KotcConfig): boolean {
  if (config.pointCap == null) return false;
  return s.roster.some((t) => s.roundPoints[t] >= config.pointCap!);
}

function applyRally(
  s: KotcState,
  winnerSide: "king" | "challenger",
): KotcState {
  const seq = s.seq + 1;
  const king = s.kingTeamId;
  const challenger = s.challengerTeamId;
  const queue = [...s.queue];

  const next: KotcState = {
    ...s,
    seq,
    roundPoints: { ...s.roundPoints },
    roundStreak: { ...s.roundStreak },
    roundLongest: { ...s.roundLongest },
    roundReachedSeq: { ...s.roundReachedSeq },
    totalPoints: { ...s.totalPoints },
    totalLongest: { ...s.totalLongest },
    totalReachedSeq: { ...s.totalReachedSeq },
  };

  if (winnerSide === "king") {
    // King scores and stays; the streak grows.
    next.roundPoints[king] += 1;
    next.totalPoints[king] += 1;
    next.roundStreak[king] += 1;
    next.roundLongest[king] = Math.max(
      next.roundLongest[king],
      next.roundStreak[king],
    );
    next.totalLongest[king] = Math.max(
      next.totalLongest[king],
      next.roundStreak[king],
    );
    next.roundReachedSeq[king] = seq;
    next.totalReachedSeq[king] = seq;
    // Beaten challenger to the back; next challenger steps in.
    queue.push(challenger);
    next.challengerTeamId = queue.shift()!;
    // king unchanged
  } else {
    // Challenger wins → becomes King (no point). Both streaks reset.
    next.roundStreak[king] = 0;
    next.roundStreak[challenger] = 0;
    queue.push(king); // dethroned King to the back
    next.kingTeamId = challenger;
    next.challengerTeamId = queue.shift()!;
  }

  next.queue = queue;
  return next;
}

/**
 * Challenger missed the serve. The King holds the court but earns NO point, and
 * the King's streak is neither extended nor broken (the run simply carries). The
 * challenger goes to the back of the rotation and the next challenger serves.
 */
function applyServeError(s: KotcState): KotcState {
  const queue = [...s.queue];
  queue.push(s.challengerTeamId);
  return {
    ...s,
    seq: s.seq + 1,
    challengerTeamId: queue.shift()!,
    queue,
    // king, all points/streak/reached tallies unchanged
  };
}

function applyRoundEnd(s: KotcState, config: KotcConfig): KotcState {
  // Rank the just-finished round, then re-seed the next round by those standings.
  const order = rankKotcPool(roundResults(s)).map((r) => r.teamId);
  const roundIndex = s.roundIndex + 1;
  const complete = roundIndex >= config.roundsPerSession;
  return {
    ...s,
    roundIndex,
    status: complete ? "complete" : "in_progress",
    kingTeamId: order[0],
    challengerTeamId: order[1],
    queue: order.slice(2),
    // per-round tallies reset; cumulative carry forward untouched
    roundPoints: zero(s.roster),
    roundStreak: zero(s.roster),
    roundLongest: zero(s.roster),
    roundReachedSeq: nulls(s.roster),
  };
}

/** Apply a single non-void event. (Void is resolved in `reduceKotc`.) */
export function applyEvent(
  s: KotcState,
  event: KotcEvent,
  config: KotcConfig,
): KotcState {
  if (s.status === "complete") return s; // session over; ignore further events
  switch (event.type) {
    case "rally":
      return applyRally(s, event.winnerSide);
    case "serve_error":
      return applyServeError(s);
    case "round_end":
      return applyRoundEnd(s, config);
    case "void":
      throw new Error("void must be resolved by reduceKotc, not applyEvent");
  }
}

/**
 * Fold an event log into final state. `void` events undo the most recent rally
 * (an organizer's "undo last tap"); round_end events are not voided.
 */
export function reduceKotc(
  pairOrder: TeamId[],
  events: KotcEvent[],
  config: KotcConfig,
): KotcState {
  // Resolve voids first: drop the latest still-standing rally for each void.
  const effective: KotcEvent[] = [];
  for (const e of events) {
    if (e.type === "void") {
      for (let i = effective.length - 1; i >= 0; i--) {
        if (isUndoableTap(effective[i])) {
          effective.splice(i, 1);
          break;
        }
      }
    } else {
      effective.push(e);
    }
  }
  return effective.reduce(
    (state, e) => applyEvent(state, e, config),
    initKotcPool(pairOrder),
  );
}
