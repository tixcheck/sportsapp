import { describe, expect, it } from "vitest";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import {
  teamOffRounds,
  teamScheduleEntries,
  teamTimeline,
} from "@/lib/schedule/team-timeline";

/** ISO time on the tournament day, in the venue offset. */
const T = (h: number, m: number): string =>
  `2026-07-25T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;

/** A minimal round match: `home` vs `away`, officiated by `ref`, at `time`. */
function mk(
  round: number,
  home: string,
  away: string,
  ref: string | null,
  time: string | null = null,
): ScheduleMatch {
  return {
    id: `r${round}-${home}-${away}-${time ?? "tbd"}`,
    round,
    scheduledAt: time,
    court: null,
    status: "scheduled",
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: home,
    awayTeamName: away,
    refTeamId: ref,
    refTeamName: ref,
    isAbnormal: false,
    sets: [],
  };
}

describe("teamTimeline — Play/Ref/Off slots", () => {
  it("marks a skipped game slot as rest between two duties", () => {
    const matches = [
      mk(1, "A", "B", "C", T(10, 50)), // A plays
      mk(2, "C", "D", "A", T(11, 10)), // A refs
      mk(2, "A", "E", "F", T(11, 30)), // A plays
      mk(3, "G", "H", "I", T(11, 50)), // A not involved — a real grid slot
      mk(3, "A", "D", "B", T(12, 10)), // A plays
    ];
    const t = teamTimeline("A", matches);
    expect(t.map((s) => s.activity)).toEqual([
      "play",
      "ref",
      "play",
      "off",
      "play",
    ]);
    const rest = t.find((s) => s.activity === "off");
    expect(rest?.at).toBe(T(11, 50)); // the 11:50 slot A sits out
    expect(rest?.round).toBeNull();
    expect(rest?.match).toBeNull();
  });

  it("shows no rest before the first or after the last duty", () => {
    const matches = [
      mk(1, "X", "Y", "Z", T(10, 50)), // A absent — before its day starts
      mk(2, "A", "B", "C", T(11, 10)), // A's first duty
      mk(3, "A", "D", "E", T(11, 30)), // A's last duty (back-to-back)
      mk(4, "X", "Y", "Z", T(11, 50)), // A absent — after its day ends
    ];
    expect(teamTimeline("A", matches).map((s) => s.activity)).toEqual([
      "play",
      "play",
    ]);
  });

  it("keeps a same-round ref and play without a phantom rest between them", () => {
    const matches = [
      mk(2, "C", "D", "A", T(11, 10)), // A refs
      mk(2, "A", "B", "E", T(11, 30)), // A plays — next slot, no gap
    ];
    expect(teamTimeline("A", matches).map((s) => s.activity)).toEqual([
      "ref",
      "play",
    ]);
  });
});

describe("teamScheduleEntries", () => {
  it("lists a ref duty and a rest slot the team sits out", () => {
    const matches = [
      mk(1, "A", "B", "C", T(10, 50)),
      mk(2, "C", "D", "A", T(11, 10)), // ref
      mk(2, "A", "E", "F", T(11, 30)), // play
      mk(3, "G", "H", "I", T(11, 50)), // A off
      mk(3, "A", "D", "B", T(12, 10)), // play
    ];
    const entries = teamScheduleEntries("A", matches);
    expect(entries.map((e) => e.kind)).toEqual([
      "play",
      "ref",
      "play",
      "off",
      "play",
    ]);
    expect(entries.find((e) => e.kind === "off")?.at).toBe(T(11, 50));
  });
});

describe("teamOffRounds — whole-round byes", () => {
  it("returns rounds the team sits out entirely, within its window", () => {
    const matches = [
      mk(1, "X", "Y", "Z", T(10, 50)), // before A — excluded
      mk(2, "A", "B", "C", T(11, 10)), // A plays
      mk(3, "D", "E", "F", T(11, 30)), // R3 exists, A absent → bye
      mk(4, "B", "C", "A", T(11, 50)), // A refs
      mk(5, "X", "Y", "Z", T(12, 10)), // after A — excluded
    ];
    expect(teamOffRounds("A", matches)).toEqual([3]);
  });

  it("is empty when the team has a duty every round", () => {
    const matches = [
      mk(1, "A", "B", "C", T(10, 50)),
      mk(2, "C", "D", "A", T(11, 10)), // refs R2
      mk(2, "A", "E", "F", T(11, 30)), // plays R2
      mk(3, "A", "D", "B", T(12, 10)), // plays R3
    ];
    expect(teamOffRounds("A", matches)).toEqual([]);
  });
});

describe("teamTimeline — same-day rest gate", () => {
  const tz = "America/Toronto";
  const at = (day: number, h: number, m: number): string =>
    `2026-07-${String(day).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;
  const hasOff = (t: { activity: string }[]) =>
    t.some((s) => s.activity === "off");

  it("shows a rest for a gap within the same day", () => {
    // A plays 18:00 and 19:30 the same night; the 18:45 slot (B vs C) is a sit-out.
    const matches = [
      mk(1, "A", "X", null, at(25, 18, 0)),
      mk(1, "B", "C", null, at(25, 18, 45)),
      mk(2, "A", "Y", null, at(25, 19, 30)),
    ];
    expect(hasOff(teamTimeline("A", matches, tz))).toBe(true);
  });

  it("hides the gap when the next duty is on a later day", () => {
    // A plays this week (Jul 25) then next week (Aug 1) — a weekly-league gap.
    const matches = [
      mk(1, "A", "X", null, at(25, 18, 0)),
      mk(1, "B", "C", null, at(25, 18, 45)), // same-night sit-out, but...
      mk(2, "A", "Y", null, "2026-08-01T18:00:00-04:00"), // next game is next week
    ];
    expect(hasOff(teamTimeline("A", matches, tz))).toBe(false);
  });

  it("treats every gap as rest without a timezone (legacy)", () => {
    const matches = [
      mk(1, "A", "X", null, at(25, 18, 0)),
      mk(1, "B", "C", null, at(25, 18, 45)),
      mk(2, "A", "Y", null, "2026-08-01T18:00:00-04:00"),
    ];
    expect(hasOff(teamTimeline("A", matches))).toBe(true);
  });
});

describe("teamTimeline — parallel divisions on different clocks", () => {
  /** A match tagged with the division it belongs to. */
  function md(
    round: number,
    home: string,
    away: string,
    time: string,
    divisionId: string,
  ): ScheduleMatch {
    return { ...mk(round, home, away, null, time), divisionId };
  }

  // Brampton's real shape: one division on 40-minute games (6:30, 7:10, 7:50)
  // and another on 30-minute games (6:30, 7:00, 7:30) at the same time on
  // different courts.
  const matches = [
    md(1, "A1", "A2", T(18, 30), "div-a"),
    md(2, "A1", "A3", T(19, 10), "div-a"),
    md(3, "A1", "A4", T(19, 50), "div-a"),
    md(1, "E1", "E2", T(18, 30), "div-e"),
    md(2, "E1", "E3", T(19, 0), "div-e"),
    md(3, "E1", "E4", T(19, 30), "div-e"),
  ];

  it("does not invent rest from another division's tip-off times", () => {
    // A1 plays 6:30, 7:10, 7:50 back to back. The 7:00 and 7:30 slots belong to
    // the 30-minute division and must not read as a break.
    const t = teamTimeline("A1", matches, "America/Toronto");
    expect(t.map((s) => s.activity)).toEqual(["play", "play", "play"]);
  });

  it("is symmetric for the division on the shorter clock", () => {
    const t = teamTimeline("E1", matches, "America/Toronto");
    expect(t.map((s) => s.activity)).toEqual(["play", "play", "play"]);
  });

  it("still reports a genuine rest slot within the team's own division", () => {
    const withGap = [
      md(1, "A1", "A2", T(18, 30), "div-a"),
      md(2, "A3", "A4", T(19, 10), "div-a"), // A1 sits this one out
      md(3, "A1", "A3", T(19, 50), "div-a"),
      md(2, "E1", "E3", T(19, 0), "div-e"),
    ];
    const t = teamTimeline("A1", withGap, "America/Toronto");
    expect(t.map((s) => s.activity)).toEqual(["play", "off", "play"]);
    // The rest is A's own 7:10 slot, never division E's 7:00.
    expect(t[1].at).toBe(T(19, 10));
  });

  it("keeps the schedule list and the strip in agreement", () => {
    const entries = teamScheduleEntries("A1", matches, "America/Toronto");
    expect(entries.filter((e) => e.kind === "off")).toHaveLength(0);
    expect(entries.map((e) => e.round)).toEqual([1, 2, 3]);
  });
});
