import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import {
  GRACE_HOURS,
  needsScoreReminder,
  reminderPeriodKey,
  selectScoreReminders,
  type ScoreCandidate,
} from "@/lib/email/missing-scores";

const NOW = DateTime.fromISO("2026-08-12T18:00:00.000Z", { zone: "utc" });

const match = (over: Partial<ScoreCandidate> = {}): ScoreCandidate => ({
  matchId: "m1",
  competitionId: "c1",
  competitionName: "Tuesday 6s",
  // 25 hours before NOW — just past the grace period.
  scheduledAt: "2026-08-11T17:00:00.000Z",
  round: 3,
  homeTeamId: "t1",
  awayTeamId: "t2",
  homeTeamName: "Spikers",
  awayTeamName: "Diggers",
  status: "scheduled",
  hasSets: false,
  ...over,
});

describe("needsScoreReminder", () => {
  it("nudges an unscored game past the grace period", () => {
    expect(needsScoreReminder(match(), NOW)).toBe(true);
  });

  it("stays quiet inside the grace period", () => {
    // 23 hours ago — the game may still be being played or written up.
    expect(
      needsScoreReminder(
        match({ scheduledAt: "2026-08-11T19:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("nudges exactly at the boundary", () => {
    const exactly = NOW.minus({ hours: GRACE_HOURS }).toISO()!;
    expect(needsScoreReminder(match({ scheduledAt: exactly }), NOW)).toBe(true);
  });

  it("never nudges a future game", () => {
    expect(
      needsScoreReminder(
        match({ scheduledAt: "2026-08-20T17:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("leaves finished games alone", () => {
    for (const status of ["completed", "forfeit", "cancelled"]) {
      expect(needsScoreReminder(match({ status }), NOW)).toBe(false);
    }
  });

  it("leaves a match alone once any set exists", () => {
    // Someone is mid-entry; chasing them would be noise.
    expect(needsScoreReminder(match({ hasSets: true }), NOW)).toBe(false);
    expect(
      needsScoreReminder(match({ hasSets: true, status: "in_progress" }), NOW),
    ).toBe(false);
  });

  it("still nudges an in_progress match with nothing entered", () => {
    // Left "in progress" and forgotten is exactly the case this exists for.
    expect(needsScoreReminder(match({ status: "in_progress" }), NOW)).toBe(
      true,
    );
  });

  it("skips a match with a missing team — a bye has no captain to write to", () => {
    expect(needsScoreReminder(match({ homeTeamId: null }), NOW)).toBe(false);
    expect(needsScoreReminder(match({ awayTeamId: null }), NOW)).toBe(false);
  });

  it("skips an unparseable date rather than guessing", () => {
    expect(needsScoreReminder(match({ scheduledAt: "not a date" }), NOW)).toBe(
      false,
    );
  });
});

describe("selectScoreReminders", () => {
  it("returns only the ones needing a nudge, newest first", () => {
    const rows = [
      match({ matchId: "old", scheduledAt: "2026-08-01T17:00:00.000Z" }),
      match({ matchId: "recent", scheduledAt: "2026-08-11T17:00:00.000Z" }),
      match({ matchId: "scored", hasSets: true }),
      match({ matchId: "future", scheduledAt: "2026-09-01T17:00:00.000Z" }),
    ];

    expect(selectScoreReminders(rows, NOW).map((m) => m.matchId)).toEqual([
      "recent",
      "old",
    ]);
  });

  it("returns nothing when everything is scored", () => {
    expect(selectScoreReminders([match({ hasSets: true })], NOW)).toEqual([]);
  });
});

describe("reminderPeriodKey", () => {
  it("keys on the match so a daily cron can't nag twice", () => {
    expect(reminderPeriodKey("abc")).toBe("match:abc");
    expect(reminderPeriodKey("abc")).toBe(reminderPeriodKey("abc"));
    expect(reminderPeriodKey("abc")).not.toBe(reminderPeriodKey("def"));
  });
});
