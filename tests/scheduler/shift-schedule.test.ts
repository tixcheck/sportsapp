import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import {
  planScheduleShift,
  type ShiftMatch,
} from "@/lib/scheduler/shift-schedule";

const TZ = "America/Toronto";

/** A scheduled, unplayed league match at a local wall-clock time. */
function match(
  id: string,
  local: string | null,
  extra: Partial<ShiftMatch> = {},
): ShiftMatch {
  return {
    id,
    scheduledAt: local
      ? DateTime.fromISO(local, { zone: TZ }).toUTC().toISO()
      : null,
    court: "Court 1",
    homeTeamId: "home",
    awayTeamId: "away",
    status: "scheduled",
    ...extra,
  };
}

/** The local wall-clock time a move lands on, for readable assertions. */
function localOf(iso: string): string {
  return DateTime.fromISO(iso, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm");
}

describe("planScheduleShift", () => {
  it("pushes every unplayed match on/after the cutoff by the given weeks", () => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00"), match("b", "2026-07-23T19:00")],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(2);
    expect(localOf(plan.moves[0].to)).toBe("2026-07-23 19:00");
    expect(localOf(plan.moves[1].to)).toBe("2026-07-30 19:00");
    expect(plan.skipped).toHaveLength(0);
  });

  it("leaves matches before the cutoff alone", () => {
    const plan = planScheduleShift({
      matches: [
        match("past", "2026-07-09T19:00"),
        match("today", "2026-07-16T19:00"),
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves.map((m) => m.matchId)).toEqual(["today"]);
    expect(plan.skipped).toEqual([
      { matchId: "past", reason: "before-cutoff" },
    ]);
  });

  it("includes a match earlier on the cutoff day itself", () => {
    // Cutoff is a calendar day, not an instant: a 9am game on the cutoff date
    // still moves even though the organizer acts at noon.
    const plan = planScheduleShift({
      matches: [match("morning", "2026-07-16T09:00")],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(1);
    expect(localOf(plan.moves[0].to)).toBe("2026-07-23 09:00");
  });

  it.each(["completed", "in_progress", "forfeit"])(
    "never moves a %s match",
    (status) => {
      const plan = planScheduleShift({
        matches: [match("played", "2026-07-16T19:00", { status })],
        fromDate: "2026-07-16",
        weeks: 1,
        timezone: TZ,
      });

      expect(plan.moves).toHaveLength(0);
      expect(plan.skipped).toEqual([
        { matchId: "played", reason: "already-played" },
      ]);
    },
  );

  it("skips matches with no time set (Time TBD)", () => {
    const plan = planScheduleShift({
      matches: [match("tbd", null)],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(0);
    expect(plan.skipped).toEqual([{ matchId: "tbd", reason: "no-time" }]);
  });

  it("skips a match whose stored timestamp is unparseable", () => {
    const plan = planScheduleShift({
      matches: [
        {
          ...match("junk", "2026-07-16T19:00"),
          scheduledAt: "not-a-timestamp",
        },
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(0);
    expect(plan.skipped).toEqual([{ matchId: "junk", reason: "no-time" }]);
  });

  it("keeps the local wall-clock time across a DST boundary", () => {
    // 2026-03-08 is the spring-forward date in Toronto. A 7pm game must stay a
    // 7pm game — adding 7*24h of milliseconds would land it at 8pm.
    const plan = planScheduleShift({
      matches: [match("dst", "2026-03-04T19:00")],
      fromDate: "2026-03-04",
      weeks: 1,
      timezone: TZ,
    });

    expect(localOf(plan.moves[0].to)).toBe("2026-03-11 19:00");
    // Proves the offset really did change (EST -05:00 → EDT -04:00).
    expect(plan.moves[0].to).toBe("2026-03-11T23:00:00.000Z");
  });

  it("warns when a shifted match lands on a blackout date", () => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00")],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
      blackoutDates: ["2026-07-23"],
    });

    expect(plan.moves).toHaveLength(1);
    expect(plan.warnings).toEqual([
      {
        type: "blackout",
        matchId: "a",
        detail: "Lands on 2026-07-23, a blackout date.",
      },
    ]);
  });

  it("warns when a shifted match collides with a court that isn't moving", () => {
    // A completed game next week stays put; a moved game lands on its slot.
    const plan = planScheduleShift({
      matches: [
        match("moving", "2026-07-16T19:00"),
        match("stays", "2026-07-23T19:00", {
          status: "completed",
          homeTeamId: "x",
          awayTeamId: "y",
        }),
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.warnings).toContainEqual({
      type: "court",
      matchId: "moving",
      detail: "Court clashes with a game that isn't moving.",
    });
  });

  it("warns when a team would play twice at the same time after the shift", () => {
    const plan = planScheduleShift({
      matches: [
        match("moving", "2026-07-16T19:00", { homeTeamId: "shared" }),
        match("stays", "2026-07-23T19:00", {
          status: "completed",
          court: "Court 2",
          homeTeamId: "shared",
          awayTeamId: "other",
        }),
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.warnings).toContainEqual({
      type: "team",
      matchId: "moving",
      detail: "A team already plays a game that isn't moving at this time.",
    });
  });

  it("does not flag conflicts between two matches that both move", () => {
    // Both shift by the same amount, so their relative layout is unchanged.
    const plan = planScheduleShift({
      matches: [
        match("a", "2026-07-16T19:00", { court: "Court 1" }),
        match("b", "2026-07-16T21:00", { court: "Court 1" }),
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(2);
    expect(plan.warnings).toHaveLength(0);
  });

  it("reports the vacated dates as the No Games week", () => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00"), match("b", "2026-07-16T21:00")],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.vacatedDates).toEqual(["2026-07-16"]);
  });

  it("does not vacate a date that still has a game that isn't moving", () => {
    const plan = planScheduleShift({
      matches: [
        match("moving", "2026-07-16T19:00"),
        match("played", "2026-07-16T21:00", { status: "completed" }),
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves.map((m) => m.matchId)).toEqual(["moving"]);
    expect(plan.vacatedDates).toEqual([]);
  });

  it("does not vacate a date that another match shifts onto", () => {
    // Week 1 empties onto week 2, but week 2's own games move to week 3 — so
    // only week 1 is genuinely left with no games.
    const plan = planScheduleShift({
      matches: [
        match("w1", "2026-07-16T19:00"),
        match("w2", "2026-07-23T19:00"),
      ],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.vacatedDates).toEqual(["2026-07-16"]);
  });

  it("pushes the season end date by the same number of weeks", () => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00")],
      fromDate: "2026-07-16",
      weeks: 2,
      timezone: TZ,
      endDate: "2026-08-27",
    });

    expect(localOf(plan.moves[0].to)).toBe("2026-07-30 19:00");
    expect(plan.newEndDate).toBe("2026-09-10");
  });

  it("returns a null end date when the competition has none", () => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00")],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.newEndDate).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])("plans nothing for weeks = %s", (weeks) => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00")],
      fromDate: "2026-07-16",
      weeks,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(0);
    expect(plan.vacatedDates).toEqual([]);
  });

  it("plans nothing for an invalid cutoff date", () => {
    const plan = planScheduleShift({
      matches: [match("a", "2026-07-16T19:00")],
      fromDate: "not-a-date",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan.moves).toHaveLength(0);
  });

  it("handles an empty schedule", () => {
    const plan = planScheduleShift({
      matches: [],
      fromDate: "2026-07-16",
      weeks: 1,
      timezone: TZ,
    });

    expect(plan).toMatchObject({
      moves: [],
      skipped: [],
      warnings: [],
      vacatedDates: [],
    });
  });
});
