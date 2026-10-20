/**
 * Building the weekly "your matches this week" digest list. Pure: no DB, no
 * clock — the cron route fetches rows and hands them here, so the ordering and
 * formatting are unit-testable on their own.
 */
import { DateTime } from "luxon";

import type { Sport } from "@/lib/formats";
import { formatCourtLabel } from "@/lib/scheduler/court-label";
import type { ReminderItem } from "./templates/match-reminder";
import { NET_SETUP_MINUTES } from "@/lib/scheduler/net-duty";

export interface DigestMatchInput {
  competitionName: string;
  /** Opponent's team name; "TBD" when the other side isn't known yet. */
  opponentName: string;
  /** Match start as a UTC ISO timestamp (TIMESTAMPTZ from the DB). */
  scheduledAt: string;
  /** IANA zone of the competition's venue — the times players actually read. */
  timezone: string;
  court: string | null;
  round: number | null;
  /** Names the surface — a softball player is told a field, not a court. */
  sport?: Sport;
  /** This player's team puts up the net before this game (0179). */
  netSetup?: boolean;
  /** This player's team takes the net down after this game (0179). */
  netTakedown?: boolean;
}

/** Sort key: the absolute instant, so games across competitions in different
 * zones still interleave in true chronological order. Unparseable timestamps
 * sort last rather than throwing. */
function instant(iso: string): number {
  const ms = DateTime.fromISO(iso).toMillis();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/**
 * A player's matches for the digest: ordered by day then start time, each
 * labelled with its day, local start time, and court.
 *
 * Ordering is by absolute instant (not by competition), because the email is
 * one person's week — they want to read it top-to-bottom as their day runs.
 * Ties keep input order, so two games at the same time stay stable between
 * sends rather than shuffling.
 */
export function buildReminderItems(
  matches: DigestMatchInput[],
): ReminderItem[] {
  return matches
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        instant(a.m.scheduledAt) - instant(b.m.scheduledAt) || a.i - b.i,
    )
    .map(({ m }) => {
      const dt = DateTime.fromISO(m.scheduledAt, { zone: m.timezone });
      // A bad zone or timestamp shouldn't drop the game from someone's email —
      // fall back to the opponent line alone and let the schedule link carry it.
      const when = dt.isValid
        ? `${dt.toFormat("ccc, LLL d")} · ${dt.toFormat("h:mm a")}`
        : undefined;

      // Court first: on the day, "which court" is the thing players scan for.
      const detail = [
        formatCourtLabel(m.court, m.sport),
        m.round ? `Round ${m.round}` : null,
        m.netSetup
          ? `Your team puts up the net: arrive ${NET_SETUP_MINUTES} min early`
          : null,
        m.netTakedown ? "Your team takes the net down after this game" : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        competitionName: m.competitionName,
        summary: `vs ${m.opponentName}`,
        when,
        detail: detail || undefined,
      };
    });
}
