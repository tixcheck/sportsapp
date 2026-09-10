import { describe, expect, it } from "vitest";

import {
  matchesForTeamOnNight,
  nightOf,
  playingNights,
  teamsPlayingOnNight,
  type NightMatch,
} from "@/lib/stats/night-lineup";

const TZ = "America/Toronto";

// A Tuesday night league: three games from 8pm, plus the following Tuesday.
const m = (
  id: string,
  home: string | null,
  away: string | null,
  at: string | null,
): NightMatch => ({ id, homeTeamId: home, awayTeamId: away, scheduledAt: at });

const WEEK1 = [
  m("m1", "t1", "t2", "2026-10-13T24:00:00.000Z"), // 8pm Toronto
  m("m2", "t3", "t4", "2026-10-14T01:00:00.000Z"), // 9pm Toronto
  m("m3", "t1", "t3", "2026-10-14T02:00:00.000Z"), // 10pm Toronto
];
const WEEK2 = [m("m4", "t2", "t1", "2026-10-21T00:00:00.000Z")];
const ALL = [...WEEK1, ...WEEK2];

describe("nightOf", () => {
  it("uses the competition's zone, not the reader's", () => {
    // 1am UTC on the 14th is still Tuesday the 13th in Toronto — the night the
    // league is actually playing.
    expect(nightOf("2026-10-14T01:00:00.000Z", TZ)).toBe("2026-10-13");
    expect(nightOf("2026-10-14T01:00:00.000Z", "UTC")).toBe("2026-10-14");
  });

  it("is null for a match nobody has scheduled", () => {
    expect(nightOf(null, TZ)).toBeNull();
    expect(nightOf("not a date", TZ)).toBeNull();
  });
});

describe("playingNights", () => {
  it("lists each night once, chronologically", () => {
    expect(playingNights(ALL, TZ)).toEqual(["2026-10-13", "2026-10-20"]);
  });

  it("ignores unscheduled matches rather than inventing a night", () => {
    expect(playingNights([...ALL, m("m9", "t1", "t2", null)], TZ)).toEqual([
      "2026-10-13",
      "2026-10-20",
    ]);
  });

  it("is empty when nothing is scheduled", () => {
    expect(playingNights([], TZ)).toEqual([]);
  });
});

describe("matchesForTeamOnNight", () => {
  // The point of the whole module: one lineup, several rows.
  it("returns every match that team plays that night", () => {
    expect(matchesForTeamOnNight(ALL, "t1", "2026-10-13", TZ)).toEqual([
      "m1",
      "m3",
    ]);
  });

  it("finds a team whether they are home or away", () => {
    expect(matchesForTeamOnNight(ALL, "t2", "2026-10-13", TZ)).toEqual(["m1"]);
    expect(matchesForTeamOnNight(ALL, "t2", "2026-10-20", TZ)).toEqual(["m4"]);
  });

  it("does not reach into another night", () => {
    expect(matchesForTeamOnNight(ALL, "t1", "2026-10-20", TZ)).toEqual(["m4"]);
  });

  it("is empty for a team not playing", () => {
    expect(matchesForTeamOnNight(ALL, "t9", "2026-10-13", TZ)).toEqual([]);
    expect(matchesForTeamOnNight(ALL, "t4", "2026-10-20", TZ)).toEqual([]);
  });
});

describe("teamsPlayingOnNight", () => {
  it("lists everyone with a game, once each", () => {
    expect(teamsPlayingOnNight(ALL, "2026-10-13", TZ)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
    ]);
  });

  it("tolerates a bye — a match with one side unfilled", () => {
    const withBye = [...WEEK1, m("m5", "t5", null, "2026-10-14T03:00:00.000Z")];
    expect(teamsPlayingOnNight(withBye, "2026-10-13", TZ)).toContain("t5");
  });
});
