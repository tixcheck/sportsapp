import { describe, expect, it } from "vitest";

import type { MatchFormat } from "@/lib/db/schema";

import {
  PLAYOFF_FORMATS,
  planPlayoffNight,
  playoffFormat,
  playoffMatchFormat,
  seedingNights,
} from "@/lib/scheduler/playoff-formats";

const F1 = playoffFormat("format-1")!;
const NIGHT = {
  date: "2026-10-02",
  startTime: "18:45",
  slotMinutes: 60,
  zone: "America/Toronto",
  courts: ["Court 1", "Court 2"],
};

describe("Playoff Format 1", () => {
  it("is listed by name with a description", () => {
    expect(PLAYOFF_FORMATS.map((f) => f.label)).toContain("Playoff Format 1");
    expect(F1.description.length).toBeGreaterThan(40);
  });

  it("plays seed 1 v seed 4 and seed 2 v seed 3", () => {
    const games = planPlayoffNight(F1, ["s1", "s2", "s3", "s4"], NIGHT);
    const semis = games.filter((g) => g.round === 1);
    expect(semis.map((g) => [g.homeTeamId, g.awayTeamId])).toEqual([
      ["s1", "s4"],
      ["s2", "s3"],
    ]);
  });

  it("leaves the final and 3rd-place game empty for the database to fill", () => {
    const later = planPlayoffNight(F1, ["a", "b", "c", "d"], NIGHT).filter(
      (g) => g.round === 2,
    );
    expect(later.map((g) => g.label)).toEqual(["Final", "3rd place"]);
    expect(later.every((g) => !g.homeTeamId && !g.awayTeamId)).toBe(true);
  });

  // place_bracket_winner climbs a semi's winner to (round + 1, ceil(pos / 2))
  // and drops a semi's loser into position 2 of the final round. The format
  // only works if its coordinates are exactly those.
  it("sits the final and 3rd place where advancement will look for them", () => {
    const games = planPlayoffNight(F1, ["a", "b", "c", "d"], NIGHT);
    const at = (r: number, p: number) =>
      games.find((g) => g.round === r && g.position === p)?.label;
    expect(at(1, 1)).toBe("Semi-final 1");
    expect(at(1, 2)).toBe("Semi-final 2");
    expect(at(2, Math.ceil(1 / 2))).toBe("Final");
    expect(at(2, Math.ceil(2 / 2))).toBe("Final");
    expect(at(2, 2)).toBe("3rd place");
  });

  it("runs semis together, then final and 3rd place together, on both courts", () => {
    const games = planPlayoffNight(F1, ["a", "b", "c", "d"], NIGHT);
    const when = (label: string) =>
      games.find((g) => g.label === label)!.scheduledAt;
    expect(when("Semi-final 1")).toBe(when("Semi-final 2"));
    expect(when("Final")).toBe(when("3rd place"));
    expect(when("Semi-final 1")).toContain("2026-10-02T18:45");
    expect(when("Final")).toContain("2026-10-02T19:45");
    expect(games.map((g) => g.court)).toEqual([
      "Court 1",
      "Court 2",
      "Court 1",
      "Court 2",
    ]);
  });

  it("refuses the wrong number of teams", () => {
    expect(() => planPlayoffNight(F1, ["a", "b", "c"], NIGHT)).toThrow(
      /exactly 4/,
    );
  });

  it("refuses one team taking two seeds", () => {
    expect(() => planPlayoffNight(F1, ["a", "b", "a", "d"], NIGHT)).toThrow(
      /one seed/,
    );
  });

  it("refuses a one-court league", () => {
    expect(() =>
      planPlayoffNight(F1, ["a", "b", "c", "d"], {
        ...NIGHT,
        courts: ["Court 1"],
      }),
    ).toThrow(/2 courts/);
  });
});

describe("playoffMatchFormat", () => {
  it("keeps the league's set length and rules, three sets of them", () => {
    const bigShoots: MatchFormat = {
      bestOf: 2,
      setsToPoints: [25, 25],
      winBy: 2,
      capPoints: 27,
    };
    expect(playoffMatchFormat(F1, bigShoots)).toEqual({
      bestOf: 3,
      setsToPoints: [25, 25, 25],
      winBy: 2,
      capPoints: 27,
    });
  });
});

describe("seedingNights", () => {
  // Big Shoots: three-night sessions, the third night the playoff.
  const FRIDAYS = [
    "2026-09-18",
    "2026-09-25",
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
  ];

  it("seeds session 1's playoff from its first two nights", () => {
    expect(seedingNights(FRIDAYS, 3, "2026-10-02")).toEqual([
      "2026-09-18",
      "2026-09-25",
    ]);
  });

  // Team 1 is different people after a re-draft: session 1 must not count.
  it("seeds session 2's playoff from session 2 only", () => {
    expect(seedingNights(FRIDAYS, 3, "2026-10-23")).toEqual([
      "2026-10-09",
      "2026-10-16",
    ]);
  });

  it("uses every earlier night in a league without sessions", () => {
    expect(seedingNights(FRIDAYS, null, "2026-10-09")).toEqual([
      "2026-09-18",
      "2026-09-25",
      "2026-10-02",
    ]);
  });

  it("has nothing to seed from on a session's first night", () => {
    expect(seedingNights(FRIDAYS, 3, "2026-10-09")).toEqual([]);
  });
});
