/**
 * Deciding which league games still need a score.
 *
 * Pure — the cron hands it rows and a clock, and gets back the matches worth
 * nudging about. Keeping the rule here rather than in a SQL WHERE clause is
 * what makes "does a forfeit count?" something a test can pin down.
 */

import { DateTime } from "luxon";

export type ScoreCandidate = {
  matchId: string;
  competitionId: string;
  competitionName: string;
  /** ISO, UTC. */
  scheduledAt: string;
  round: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  status: string;
  /** Whether any set score has been recorded for this match. */
  hasSets: boolean;
};

/** How long after kickoff we assume someone simply forgot. */
export const GRACE_HOURS = 24;

/**
 * A match is worth nudging when it was scheduled to be played, that time has
 * been and gone by the grace period, and nobody has entered anything.
 *
 * Deliberately excluded:
 * - `completed` and `forfeit` — the result is in, by score or by decision.
 * - `cancelled` — there is nothing to score.
 * - anything with sets already recorded, even if the match is still
 *   `in_progress`: someone is clearly mid-entry and does not need chasing.
 * - matches with a missing team (a bye, or an unfilled bracket slot) — there
 *   is no captain to write to.
 */
export function needsScoreReminder(
  match: ScoreCandidate,
  now: DateTime,
): boolean {
  if (match.status === "completed") return false;
  if (match.status === "forfeit") return false;
  if (match.status === "cancelled") return false;
  if (match.hasSets) return false;
  if (!match.homeTeamId || !match.awayTeamId) return false;

  const played = DateTime.fromISO(match.scheduledAt, { zone: "utc" });
  if (!played.isValid) return false;

  return now.diff(played, "hours").hours >= GRACE_HOURS;
}

/**
 * Filter a batch, newest first.
 *
 * Ordered so that if a send budget ever caps the run, the games people still
 * remember are the ones chased — a nudge about last month's game is noise.
 */
export function selectScoreReminders(
  matches: ScoreCandidate[],
  now: DateTime,
): ScoreCandidate[] {
  return matches
    .filter((m) => needsScoreReminder(m, now))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

/**
 * The idempotency key for one nudge.
 *
 * `notification_log` is unique on (user, kind, period), so keying the period on
 * the match id means one reminder per person per match, forever — a daily cron
 * re-running over the same unscored game can't nag anybody twice.
 */
export function reminderPeriodKey(matchId: string): string {
  return `match:${matchId}`;
}
