/**
 * Who on a team being drafted has already played together. Pure: no DB.
 *
 * Big Shoots re-drafts every session so people end up on a team with everyone.
 * The organizer had the who-played-with-whom grid on the Stats tab and a
 * "never played together" list beside the board — 20 lines of names, and
 * Liam's verdict was "hard to make sense of it" (2026-10-08). The question he
 * is actually asking while dragging people around is narrower: on the teams
 * I'm building right now, who has already been together? So the board answers
 * that, live, per team and per player.
 */

import type { PartnerGrid } from "@/lib/stats/partner-grid";

/** Nights two pool players have shared a team: `[a][b]`, by draft-pool id. */
export type PairNights = Record<string, Record<string, number>>;

/**
 * The grid re-keyed by draft-pool id, keeping only pairs who have played
 * together. `pool` maps each pool player to the identity their lineups are
 * keyed by (account, else name).
 */
export function pairNightsForPool(
  grid: PartnerGrid,
  pool: { id: string; key: string }[],
): PairNights {
  const index = new Map(grid.players.map((p, i) => [p.key, i]));
  const out: PairNights = {};
  for (const a of pool) {
    const i = index.get(a.key);
    if (i === undefined) continue;
    for (const b of pool) {
      if (a.id === b.id) continue;
      const j = index.get(b.key);
      if (j === undefined) continue;
      const n = grid.counts[i]?.[j] ?? 0;
      if (n > 0) (out[a.id] ??= {})[b.id] = n;
    }
  }
  return out;
}

export interface TeamRepeats {
  /** Pairs on this team who have played together before. */
  pairs: number;
  /** For each player: the teammates they've already played with, most first. */
  byPlayer: Record<string, { id: string; nights: number }[]>;
}

/** Repeat pairings inside one team, as it stands on the board. */
export function teamRepeats(ids: string[], nights: PairNights): TeamRepeats {
  let pairs = 0;
  const byPlayer: TeamRepeats["byPlayer"] = {};
  for (let x = 0; x < ids.length; x++) {
    for (let y = x + 1; y < ids.length; y++) {
      const n = nights[ids[x]]?.[ids[y]] ?? 0;
      if (n === 0) continue;
      pairs += 1;
      (byPlayer[ids[x]] ??= []).push({ id: ids[y], nights: n });
      (byPlayer[ids[y]] ??= []).push({ id: ids[x], nights: n });
    }
  }
  for (const list of Object.values(byPlayer)) {
    list.sort((a, b) => b.nights - a.nights);
  }
  return { pairs, byPlayer };
}
