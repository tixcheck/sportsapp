/**
 * Attendance: who turned up, who didn't, and what they won on playoff nights.
 *
 * Two questions a drafted league's organizer asks every few weeks. "How many
 * nights has this person actually played?" and "how many nights did they not
 * turn up at all?" Neither is a set statistic — six sets on a Friday is ONE
 * night — so they live here rather than in `player-stats.ts`, which is
 * arithmetic over sets.
 *
 * Both are asked of the PLAYER, not of a team. Owner's rule, 2026-09-22:
 * "stats goes to players irrespective of what team they play … they shuffle.
 * But stats are supposed to stay with players." So someone lent to another
 * side for the night has played, full stop. The team-side question that used
 * to live here — "how often did I have to find cover for this slot?" — is a
 * real question and is no longer answered anywhere; see HANDOFF.
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
   * Nights a team had them rostered and they did not play AT ALL — for that
   * team or any other. Two people are therefore NOT counted: one who arrived
   * late and played two of three, and one who turned out for a different side
   * because that team was short. Both were on court.
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
  const playoffWins = new Map<string, Set<string>>();

  for (const a of appearances) {
    const night = nightOfMatch.get(a.matchId);
    if (!night) continue;
    const key = identityKey(a);
    addTo(nightsPlayed, key, night);
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
    // Played ANYWHERE that night → not a missed night, even if it was for
    // another team. Owner's rule, 2026-09-22: "stats goes to players
    // irrespective of what team they play … they shuffle. But stats are
    // supposed to stay with players."
    //
    // This used to be scoped to the team that rostered them, on the reasoning
    // that their own side still had to find cover. That is a true and useful
    // fact, but it is a fact about the TEAM, and reading it off a player's row
    // gave a shuffled player `Days 1` and `Missed 1` for the same night —
    // credited for turning out and marked absent for it at once.
    if (nightsPlayed.get(key)?.has(night)) continue;
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
