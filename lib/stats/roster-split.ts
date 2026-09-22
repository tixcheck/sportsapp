/**
 * Full-time players and the subs who covered for them.
 *
 * Big Shoots' organizer, on what the two sheets mean: "if a player is on an
 * active roster when the teams were created they are a full time player … rest
 * all are subs that are replacing them for that night."
 *
 * So membership decides this, NOT how someone happened to play. The two differ
 * in practice: David Aitken was drafted onto Team 4, missed that night, and
 * turned out as a sub for Team 3 instead — every appearance he has is
 * `role: "sub"`, and classifying on appearances would file a drafted player as
 * a sub. The roster answers "is this one of ours"; the role on the night
 * answers "who did they play for", which is a different question.
 *
 * Pure: no DB. `isFullTime` is asked once per player where the roster is
 * loaded (the stats query, the partner grid); `splitFullTime` then divides
 * rows that already carry the answer, so a page never refetches the roster.
 */

import { identityKey } from "@/lib/stats/attribution";

export interface RosterCandidate {
  userId: string | null;
  name: string;
}

/** Whether this player was drafted onto a team, rather than covering a night. */
export function isFullTime(
  player: RosterCandidate,
  rosterKeys: ReadonlySet<string>,
): boolean {
  return rosterKeys.has(
    identityKey({ userId: player.userId, playerName: player.name }),
  );
}

/**
 * Divide rows into the two sheets, preserving the order they arrived in.
 *
 * A league that drafted nobody has an empty roster, and every row arrives
 * flagged full-time — which is why there is no "everything became a sub" case
 * to guard here. That decision lives in the query, at `isFullTime`.
 */
export function splitFullTime<T extends { fullTime: boolean }>(
  rows: T[],
): { fullTime: T[]; subs: T[] } {
  const fullTime: T[] = [];
  const subs: T[] = [];
  for (const row of rows) {
    if (row.fullTime) fullTime.push(row);
    else subs.push(row);
  }
  return { fullTime, subs };
}
