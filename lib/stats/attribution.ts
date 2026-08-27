/**
 * Which sets belong to which player. Pure: no DB, no clock.
 *
 * `lib/stats/player-stats.ts` does the arithmetic and says explicitly that
 * choosing the set list is a separate, format-dependent problem. This is that
 * choice, for leagues that record who actually turned up.
 *
 * Two rules, and the second is the one that makes a drafted league work:
 *
 *   A player is credited with the sets of the MATCHES THEY APPEARED IN, not
 *   with everything their team played. Someone who misses week two is not
 *   credited with week two.
 *
 *   A sub is credited exactly like anyone else for the matches they played.
 *   They stood on the court and the points went on the scoreboard; a season's
 *   worth of subbing should show up in their record. The person they replaced
 *   gets nothing for that night, which happens for free — no appearance, no
 *   sets.
 *
 * Identity is by user id where there is one, and by NAME WITHIN THE COMPETITION
 * where there isn't, because a sub may have no account.
 *
 * Scoping that name to the team instead would be safer against two different
 * people sharing a name — and is wrong here. This format re-drafts everyone
 * every three weeks, so a team-scoped name splits a re-drafted player into two
 * half-seasons. That was the first version, and on the seeded league it turned
 * a player with five matches across two teams into two players with two and
 * three. The rarer collision is the better one to accept, and an organizer can
 * break a genuine tie by adding an initial.
 *
 * Names are compared case-insensitively with whitespace collapsed: "Jon Moser"
 * and "jon  moser" typed on different nights are one person.
 */

import type { SetResult } from "@/lib/stats/player-stats";

export type AppearanceRole = "rostered" | "sub";

export interface Appearance {
  matchId: string;
  teamId: string;
  /** Null for someone playing without an account. */
  userId: string | null;
  playerName: string;
  role: AppearanceRole;
}

/** One team's view of one match: the sets as that side experienced them. */
export interface MatchSets {
  matchId: string;
  teamId: string;
  sets: SetResult[];
}

export interface AttributedPlayer {
  /** Null when this player is identified by name alone. */
  userId: string | null;
  name: string;
  /** Every team they turned out for, in the order first seen. */
  teamIds: string[];
  sets: SetResult[];
  /** Matches played, split by how they were there. */
  matchesRostered: number;
  matchesAsSub: number;
}

/**
 * Stable identity across the whole competition: the account if there is one,
 * else the normalised name. Exported so callers resolving names back to people
 * key them the same way — two implementations of this would drift.
 */
export function identityKey(a: {
  userId: string | null;
  playerName: string;
}): string {
  return a.userId ? `u:${a.userId}` : `n:${normalizeName(a.playerName)}`;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function setsKey(matchId: string, teamId: string): string {
  return `${matchId}:${teamId}`;
}

/**
 * Turn appearances into a set list per player.
 *
 * An appearance for a match with no recorded sets contributes nothing but is
 * not an error — that is simply a game that hasn't been scored yet.
 */
export function attributeByAppearance(
  appearances: Appearance[],
  matchSets: MatchSets[],
): AttributedPlayer[] {
  const sets = new Map<string, SetResult[]>();
  for (const ms of matchSets) {
    sets.set(setsKey(ms.matchId, ms.teamId), ms.sets);
  }

  const byPlayer = new Map<string, AttributedPlayer>();
  // Guards against the same person being listed twice for one match — the
  // database has a unique index for this, but a caller assembling rows from
  // two sources shouldn't be able to double someone's season either.
  const seen = new Set<string>();

  for (const a of appearances) {
    const key = identityKey(a);
    const once = `${key}|${a.matchId}`;
    if (seen.has(once)) continue;
    seen.add(once);

    let player = byPlayer.get(key);
    if (!player) {
      player = {
        userId: a.userId,
        name: a.playerName.trim(),
        teamIds: [],
        sets: [],
        matchesRostered: 0,
        matchesAsSub: 0,
      };
      byPlayer.set(key, player);
    }

    if (!player.teamIds.includes(a.teamId)) player.teamIds.push(a.teamId);
    if (a.role === "sub") player.matchesAsSub += 1;
    else player.matchesRostered += 1;

    const played = sets.get(setsKey(a.matchId, a.teamId));
    if (played) player.sets.push(...played);
  }

  return [...byPlayer.values()];
}

/**
 * How many times each pair of players has been on the same team.
 *
 * The organizer's stated goal is "force as many combinations as possible and
 * give people an opportunity to play with everyone", which needs the count of
 * shared NIGHTS, not shared sets — six games together on one Tuesday is one
 * occasion of playing together, not six.
 *
 * Keyed by an ordered pair so `[a,b]` and `[b,a]` are the same entry.
 */
export function partnershipCounts(
  appearances: Appearance[],
  /** matchId -> the night it belongs to. Usually the local date. */
  nightOfMatch: Map<string, string>,
): Map<string, number> {
  // night:team -> the distinct players who turned out for it
  const lineups = new Map<string, Set<string>>();

  for (const a of appearances) {
    const night = nightOfMatch.get(a.matchId);
    if (!night) continue;
    const key = `${night}:${a.teamId}`;
    const id = identityKey(a);
    const lineup = lineups.get(key);
    if (lineup) lineup.add(id);
    else lineups.set(key, new Set([id]));
  }

  const counts = new Map<string, number>();
  for (const lineup of lineups.values()) {
    const ids = [...lineup].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pair = `${ids[i]}|${ids[j]}`;
        counts.set(pair, (counts.get(pair) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Pairs from `players` that never appear in `counts` — the gaps to close. */
export function pairsNeverTogether(
  playerKeys: string[],
  counts: Map<string, number>,
): [string, string][] {
  const out: [string, string][] = [];
  const sorted = [...playerKeys].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const pair = `${sorted[i]}|${sorted[j]}`;
      if (!counts.has(pair)) out.push([sorted[i], sorted[j]]);
    }
  }
  return out;
}
