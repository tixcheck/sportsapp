/**
 * Paper-style score sheet for a KotC pool session — pure, no engine change.
 *
 * Replays the kotc_events log through the engine's existing reducer to recover,
 * per round and per team, the ordered King points they scored, who each point was
 * against (the dethroned challenger), and which points belong to an unbroken King
 * run (a streak). Mirrors the paper sheet: a 1–N tally per team where each cell is
 * "{pointNumber}-{opponent}". Read-only derivation of already-captured data.
 */

import {
  applyEvent,
  initKotcPool,
  type KotcConfig,
  type KotcEvent,
} from "./engine";
import type { TeamId } from "./ranking";

export interface SheetPoint {
  /** 1-based King-point number within this round for this team. */
  pointNumber: number;
  /** The challenger beaten on this point. */
  opponentTeamId: TeamId;
  /** True when this point is part of an unbroken King run of length ≥ 2. */
  inStreak: boolean;
}

export interface SheetTeam {
  teamId: TeamId;
  points: SheetPoint[];
  totalPoints: number;
  longestStreak: number;
}

export interface SheetRound {
  roundIndex: number;
  /** The round currently being played (expanded by default in the UI). */
  active: boolean;
  /** All roster pairs, in seed order; pairs with no points have an empty list. */
  teams: SheetTeam[];
}

/** Drop the latest still-standing rally for each void (mirrors reduceKotc). */
function resolveVoids(events: KotcEvent[]): KotcEvent[] {
  const eff: KotcEvent[] = [];
  for (const e of events) {
    if (e.type === "void") {
      for (let i = eff.length - 1; i >= 0; i--) {
        if (eff[i].type === "rally") {
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

export function buildScoreSheet(
  pairOrder: TeamId[],
  events: KotcEvent[],
  config: KotcConfig,
): SheetRound[] {
  if (pairOrder.length < 2) return [];

  let state = initKotcPool(pairOrder);
  // roundIndex → teamId → ordered points
  const byRound = new Map<number, Map<TeamId, SheetPoint[]>>();
  // roundIndex → teamId → longest run length
  const longestByRound = new Map<number, Map<TeamId, number>>();
  // teamId → indices (into the current round's point list) of the current run
  let run = new Map<TeamId, number[]>();

  const ensureRound = (ri: number) => {
    if (!byRound.has(ri)) {
      byRound.set(ri, new Map(pairOrder.map((t) => [t, []])));
      longestByRound.set(ri, new Map(pairOrder.map((t) => [t, 0])));
    }
    return byRound.get(ri)!;
  };

  // Finalize a team's current run: flag streak cells + update its round-longest.
  const endRun = (ri: number, teamId: TeamId) => {
    const indices = run.get(teamId);
    if (indices && indices.length > 0) {
      const points = byRound.get(ri)!.get(teamId)!;
      if (indices.length >= 2) {
        for (const i of indices) points[i].inStreak = true;
      }
      const longest = longestByRound.get(ri)!;
      longest.set(teamId, Math.max(longest.get(teamId) ?? 0, indices.length));
    }
    run.set(teamId, []);
  };

  for (const e of resolveVoids(events)) {
    const ri = state.roundIndex;
    ensureRound(ri);

    if (e.type === "round_end") {
      for (const t of pairOrder) endRun(ri, t);
      run = new Map();
      state = applyEvent(state, e, config);
      continue;
    }
    if (e.type !== "rally") continue;

    const king = state.kingTeamId;
    const challenger = state.challengerTeamId;
    if (e.winnerSide === "king") {
      const points = byRound.get(ri)!.get(king)!;
      points.push({
        pointNumber: points.length + 1,
        opponentTeamId: challenger,
        inStreak: false,
      });
      const r = run.get(king) ?? [];
      r.push(points.length - 1);
      run.set(king, r);
    } else {
      endRun(ri, king); // dethroned King's run ends; challenger had none
      run.set(challenger, []);
    }
    state = applyEvent(state, e, config);
  }

  // Finalize the in-progress round's runs.
  const finalRi = state.roundIndex;
  ensureRound(finalRi);
  for (const t of pairOrder) endRun(finalRi, t);

  const activeRi = state.status === "complete" ? finalRi : state.roundIndex;

  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((ri) => ({
      roundIndex: ri,
      active: ri === activeRi,
      teams: pairOrder.map((t) => {
        const points = byRound.get(ri)!.get(t)!;
        return {
          teamId: t,
          points,
          totalPoints: points.length,
          longestStreak: longestByRound.get(ri)!.get(t) ?? 0,
        };
      }),
    }));
}
