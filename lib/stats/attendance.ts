/**
 * Attendance: who turned up, who didn't, and what they won on playoff nights.
 *
 * Two questions a drafted league's organizer asks every few weeks. "How many
 * nights has this person actually played?" and, the one that costs them an
 * evening on the phone, "how many times have I had to find a sub for them?"
 * Neither is a set statistic — six sets on a Friday is ONE night — so they live
 * here rather than in `player-stats.ts`, which is arithmetic over sets.
 *
 * Pure: no DB, no clock.
 */

import { identityKey, type Appearance } from "@/lib/stats/attribution";
import type { SetResult } from "@/lib/stats/player-stats";

export type MatchOutcome = "win" | "loss" | "tie";

/** A rostered player who was left out of a match's saved lineup. */
export interface Absence {
  matchId: string;
  teamId: string;
  userId: string | null;
  playerName: string;
}

export interface AttendanceTally {
  /** Distinct nights on court, for any team, as rostered or as a sub. */
  daysPlayed: number;
  /** Games won on playoff nights, counting only games they were on court for. */
  playoffGameWins: number;
  /**
   * Nights they were on a team's roster and played none of its games — the
   * nights somebody had to be found to cover them. A player who arrived late
   * and played two of three is not counted: nobody was sent for.
   */
  nightsMissed: number;
}

/**
 * Which nights are playoff nights: every `sessionNights`-th night of the season.
 *
 * Counted over the nights the league actually PLAYS, not over calendar weeks.
 * A blacked-out Christmas produces no matches and therefore no night, so it
 * cannot knock the sessions out of step — which is exactly why Big Shoots'
 * fifth playoff lands on 8 January rather than on a holiday.
 *
 * Null, or anything under 2, means the league has no sessions: a one-night
 * "session" would make every night a playoff, which is no rule at all.
 */
export function playoffNightsFor(
  nights: string[],
  sessionNights: number | null,
): Set<string> {
  if (sessionNights == null || sessionNights < 2) return new Set();
  // yyyy-MM-dd sorts chronologically as text; sort defensively anyway.
  const ordered = [...new Set(nights)].sort();
  return new Set(ordered.filter((_, i) => (i + 1) % sessionNights === 0));
}

/**
 * One team's result in one match, from the sets it played.
 *
 * Null for an unscored match. A game here is two sets, so 1–1 is a TIE, not a
 * win: "games won" means games won outright, and the standings already count a
 * tie as half, which is a different question.
 */
export function matchOutcome(sets: SetResult[]): MatchOutcome | null {
  if (sets.length === 0) return null;
  let won = 0;
  let lost = 0;
  for (const s of sets) {
    if (s.for > s.against) won += 1;
    else if (s.for < s.against) lost += 1;
  }
  if (won > lost) return "win";
  if (lost > won) return "loss";
  return "tie";
}

export function tallyAttendance(input: {
  appearances: Appearance[];
  absences: Absence[];
  /** matchId -> its night, `yyyy-MM-dd` in the competition's timezone. */
  nightOfMatch: Map<string, string>;
  outcomeOf: (matchId: string, teamId: string) => MatchOutcome | null;
  playoffNights: Set<string>;
}): Map<string, AttendanceTally> {
  const { appearances, absences, nightOfMatch, outcomeOf, playoffNights } =
    input;

  const nightsPlayed = new Map<string, Set<string>>();
  // night:team the player appeared for — what an absence is checked against.
  const appearedFor = new Map<string, Set<string>>();
  const playoffWins = new Map<string, Set<string>>();

  for (const a of appearances) {
    const night = nightOfMatch.get(a.matchId);
    if (!night) continue;
    const key = identityKey(a);
    addTo(nightsPlayed, key, night);
    addTo(appearedFor, key, `${night}:${a.teamId}`);
    if (playoffNights.has(night) && outcomeOf(a.matchId, a.teamId) === "win") {
      // A set keyed by match: listed twice for one game is still one game won.
      addTo(playoffWins, key, a.matchId);
    }
  }

  const missed = new Map<string, Set<string>>();
  for (const ab of absences) {
    const night = nightOfMatch.get(ab.matchId);
    if (!night) continue;
    const key = identityKey(ab);
    // Played any of that team's games that night → not a missed night.
    if (appearedFor.get(key)?.has(`${night}:${ab.teamId}`)) continue;
    addTo(missed, key, night);
  }

  const keys = new Set([...nightsPlayed.keys(), ...missed.keys()]);
  const out = new Map<string, AttendanceTally>();
  for (const key of keys) {
    out.set(key, {
      daysPlayed: nightsPlayed.get(key)?.size ?? 0,
      playoffGameWins: playoffWins.get(key)?.size ?? 0,
      nightsMissed: missed.get(key)?.size ?? 0,
    });
  }
  return out;
}

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}
