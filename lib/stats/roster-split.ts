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

/** One person on the roster, as the database describes them. */
export interface RosterPerson {
  userId: string | null;
  name: string | null;
}

/**
 * Every key a roster member might be recorded under — BOTH of them, when they
 * have an account.
 *
 * `identityKey` is `u:<id>` for somebody with an account and `n:<name>` for
 * everybody else, which is correct and stable as long as both sides of a
 * comparison know the same thing about a person. They don't. The lineup UI
 * writes `match_appearances.user_id` only when it happens to know the account:
 * Big Shoots has **3 rows keyed to an account and 69 by name only**. The roster
 * meanwhile keys anyone with an account by id. So Stefan Salo is `n:stefan
 * salo` in the stats and `u:c078588b…` on the roster, and the membership test
 * says no — filing a drafted player under Subs. Ten of Big Shoots' players sat
 * in the wrong table because of this, including four who had absences recorded,
 * which only a ROSTERED player can have. The data contradicted itself.
 *
 * Keying the roster both ways fixes it where it shows without rewriting 69 rows
 * of history, and it is honest about what the roster means: this person may be
 * written down as an account or as a name, and both are them.
 *
 * The cost, and why it is acceptable here: a genuine sub who shares a name with
 * a drafted player would be promoted to full-time. That needs the two to be
 * distinct people with one name AND one of them drafted — Big Shoots has two
 * accounts called "Adam Burgess" and two called "Sean Gade", and in both cases
 * the pair are placed or unplaced together, so nothing turns on it. The real
 * repair is upstream: record the account on the lineup.
 */
export function rosterKeys(people: RosterPerson[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const p of people) {
    const name = p.name?.trim() ?? "";
    // The display name is irrelevant to an id-keyed entry, hence the empty one.
    if (p.userId) keys.add(identityKey({ userId: p.userId, playerName: "" }));
    if (name) keys.add(identityKey({ userId: null, playerName: name }));
  }
  return keys;
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
