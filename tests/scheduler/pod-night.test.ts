import { describe, expect, it } from "vitest";

import {
  bareCourt,
  firstPlayingNight,
  nextPlayingNight,
  planPodNight,
  slotStart,
} from "@/lib/scheduler/pod-night";

const roster = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

// Scarborough's 2026/2027 ladder: 6/7/6/4/6/4/6.
const SMVA_SIZES = [6, 7, 6, 4, 6, 4, 6];
const smvaTiers = () =>
  SMVA_SIZES.map((n, i) => ({
    divisionId: `tier${i + 1}`,
    venueId: `gym${i + 1}`,
    teamIds: roster(`t${i + 1}-`, n),
  }));

describe("slotStart", () => {
  it("reads evening times the sheets print without AM/PM", () => {
    expect(slotStart("7:20 - 7:41")).toEqual({ hour: 19, minute: 20 });
    expect(slotStart("9:32 - 9:53")).toEqual({ hour: 21, minute: 32 });
  });

  it("leaves a time already past noon alone", () => {
    expect(slotStart("12:05 - 12:30")).toEqual({ hour: 12, minute: 5 });
  });
});

describe("bareCourt", () => {
  it("strips the heading to the label court_list stores", () => {
    expect(bareCourt("Court 3")).toBe("3");
    expect(bareCourt("court 1")).toBe("1");
    expect(bareCourt("2")).toBe("2");
  });
});

describe("planPodNight", () => {
  it("draws Scarborough's whole night: 93 fixtures", () => {
    const { fixtures, problems } = planPodNight(smvaTiers());
    expect(problems).toEqual([]);
    // 15 + 21 + 15 + 6 + 15 + 6 + 15 — the count opening night went live with.
    expect(fixtures).toHaveLength(93);
    const perTier = SMVA_SIZES.map(
      (_, i) => fixtures.filter((f) => f.divisionId === `tier${i + 1}`).length,
    );
    expect(perTier).toEqual([15, 21, 15, 6, 15, 6, 15]);
  });

  it("binds A to the first team in the seated order", () => {
    // POD_6 slot 1: Court 1 B vs D, Court 2 E vs F, Court 3 A vs C.
    const { fixtures } = planPodNight([
      { divisionId: "d", venueId: null, teamIds: roster("s", 6) },
    ]);
    const first = fixtures.filter((f) => f.slotIndex === 0);
    expect(first.map((f) => [f.court, f.homeTeamId, f.awayTeamId])).toEqual([
      ["1", "s2", "s4"],
      ["2", "s5", "s6"],
      ["3", "s1", "s3"],
    ]);
    expect(first[0]).toMatchObject({ hour: 19, minute: 20 });
  });

  it("plays every pairing in a tier exactly once", () => {
    for (const n of [4, 6, 7]) {
      const { fixtures } = planPodNight([
        { divisionId: "d", venueId: null, teamIds: roster("x", n) },
      ]);
      const keys = fixtures.map((f) =>
        [f.homeTeamId, f.awayTeamId].sort().join("|"),
      );
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toHaveLength((n * (n - 1)) / 2);
    }
  });

  it("never puts a team on two courts in one slot", () => {
    const { fixtures } = planPodNight(smvaTiers());
    const seen = new Set<string>();
    for (const f of fixtures) {
      for (const t of [f.homeTeamId, f.awayTeamId]) {
        const key = `${t}@${f.slotIndex}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("carries each tier's venue onto its fixtures", () => {
    const { fixtures } = planPodNight(smvaTiers());
    expect(
      fixtures.every((f) => f.venueId === f.divisionId.replace("tier", "gym")),
    ).toBe(true);
  });

  // A gym runs off this sheet: a missing grid is reported, never invented.
  it("refuses a tier size with no pinned grid, and draws the rest", () => {
    const { fixtures, problems } = planPodNight([
      { divisionId: "ok", venueId: null, teamIds: roster("a", 4) },
      { divisionId: "odd", venueId: null, teamIds: roster("b", 8) },
      { divisionId: "tiny", venueId: null, teamIds: roster("c", 1) },
    ]);
    expect(problems.map((p) => p.divisionId)).toEqual(["odd", "tiny"]);
    expect(problems[0].reason).toMatch(/8 teams/);
    expect(fixtures.every((f) => f.divisionId === "ok")).toBe(true);
    expect(fixtures).toHaveLength(6);
  });
});

describe("firstPlayingNight", () => {
  it("moves forward to the league's weekday", () => {
    // 2026-09-24 is a Thursday; Monday is 1.
    expect(firstPlayingNight("2026-09-24", 1, [])).toBe("2026-09-28");
  });

  it("keeps the start date when it already is that weekday", () => {
    expect(firstPlayingNight("2026-09-28", 1, [])).toBe("2026-09-28");
  });

  it("skips a blacked-out first night", () => {
    expect(firstPlayingNight("2026-09-28", 1, ["2026-09-28"])).toBe(
      "2026-10-05",
    );
  });
});

describe("nextPlayingNight", () => {
  const SMVA_BLACKOUTS = ["2026-10-12", "2026-12-21", "2026-12-28"];

  it("is a week after the night the last week actually ran", () => {
    expect(nextPlayingNight("2026-09-28", SMVA_BLACKOUTS)).toBe("2026-10-05");
  });

  it("jumps Thanksgiving Monday", () => {
    expect(nextPlayingNight("2026-10-05", SMVA_BLACKOUTS)).toBe("2026-10-19");
  });

  it("jumps consecutive blackouts over the holidays", () => {
    expect(nextPlayingNight("2026-12-14", SMVA_BLACKOUTS)).toBe("2027-01-04");
  });

  it("crosses a month and a year end on the calendar, not by arithmetic", () => {
    expect(nextPlayingNight("2026-12-30", [])).toBe("2027-01-06");
  });
});
