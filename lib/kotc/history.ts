/**
 * Derived rally history for the live scoreboard — pure, no engine change.
 *
 * Replays the event log through the engine's existing reducer, capturing the
 * King/challenger at each rally (which the simplified event log doesn't store
 * directly but the engine reconstructs deterministically). From that we get, for
 * free: who each King point was scored against, and the seq range of each pair's
 * longest unbroken King run — all from data already in kotc_events.
 */

import {
  applyEvent,
  initKotcPool,
  type KotcConfig,
  type KotcEvent,
} from "./engine";
import type { TeamId } from "./ranking";

export interface RallyRecord {
  /** The scoring pair's running King-point number (null when the challenger won). */
  pointNumber: number | null;
  kingTeamId: TeamId;
  challengerTeamId: TeamId;
  winnerTeamId: TeamId;
  /** True when the King held and scored a point. */
  scored: boolean;
  /** True when the challenger missed the serve (King held, no point scored). */
  serveError?: boolean;
  roundIndex: number;
}

export interface PairHistory {
  teamId: TeamId;
  points: number;
  /** Challengers this pair beat while King, one per point, in order. */
  beat: TeamId[];
  longestStreak: number;
  /** Point-number range of the longest unbroken King run, e.g. [1, 3] = "points 1–3". */
  longestRange: [number, number] | null;
}

/** Drop the latest still-standing rally for each void (mirrors reduceKotc). */
function resolveVoids(events: KotcEvent[]): KotcEvent[] {
  const eff: KotcEvent[] = [];
  for (const e of events) {
    if (e.type === "void") {
      for (let i = eff.length - 1; i >= 0; i--) {
        if (eff[i].type === "rally" || eff[i].type === "serve_error") {
          eff.splice(i, 1);
          break;
        }
      }
    } else {
      eff.push(e);
    }
  }
  return eff;
}

export function replayHistory(
  pairOrder: TeamId[],
  events: KotcEvent[],
  config: KotcConfig,
): { rallies: RallyRecord[]; byPair: Map<TeamId, PairHistory> } {
  const byPair = new Map<TeamId, PairHistory>(
    pairOrder.map((t) => [
      t,
      { teamId: t, points: 0, beat: [], longestStreak: 0, longestRange: null },
    ]),
  );
  if (pairOrder.length < 2) return { rallies: [], byPair };

  let state = initKotcPool(pairOrder);
  const rallies: RallyRecord[] = [];
  // Current consecutive-King run per pair: start point-number + length.
  const runStart: Record<string, number> = {};
  const runLen: Record<string, number> = {};

  for (const e of resolveVoids(events)) {
    if (e.type === "round_end") {
      for (const t of pairOrder) runLen[t] = 0; // a new round breaks every run
      state = applyEvent(state, e, config);
      continue;
    }

    const king = state.kingTeamId;
    const challenger = state.challengerTeamId;

    if (e.type === "serve_error") {
      // King holds, no point, run untouched — just log it and rotate.
      rallies.push({
        pointNumber: null,
        kingTeamId: king,
        challengerTeamId: challenger,
        winnerTeamId: king,
        scored: false,
        serveError: true,
        roundIndex: state.roundIndex,
      });
      state = applyEvent(state, e, config);
      continue;
    }
    if (e.type !== "rally") continue;

    if (e.winnerSide === "king") {
      const h = byPair.get(king)!;
      h.points += 1;
      h.beat.push(challenger);
      runLen[king] = (runLen[king] ?? 0) + 1;
      if (runLen[king] === 1) runStart[king] = h.points;
      if (runLen[king] > h.longestStreak) {
        h.longestStreak = runLen[king];
        h.longestRange = [runStart[king], h.points];
      }
      rallies.push({
        pointNumber: h.points,
        kingTeamId: king,
        challengerTeamId: challenger,
        winnerTeamId: king,
        scored: true,
        roundIndex: state.roundIndex,
      });
    } else {
      runLen[king] = 0; // dethroned King and the new King both start fresh
      runLen[challenger] = 0;
      rallies.push({
        pointNumber: null,
        kingTeamId: king,
        challengerTeamId: challenger,
        winnerTeamId: challenger,
        scored: false,
        roundIndex: state.roundIndex,
      });
    }
    state = applyEvent(state, e, config);
  }

  return { rallies, byPair };
}
