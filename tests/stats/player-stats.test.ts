import { describe, expect, it } from "vitest";

import {
  byNetClutch,
  computePlayerStats,
  formatPct,
  formatRatioPct,
  formatSigned,
  type SetResult,
} from "@/lib/stats/player-stats";

/** Shorthand: `s(21, 19)` is a set won 21–19. */
const s = (forPts: number, against: number): SetResult => ({
  for: forPts,
  against,
});

/** `n` copies of the same set. */
const many = (n: number, set: SetResult): SetResult[] =>
  Array.from({ length: n }, () => ({ ...set }));

describe("computePlayerStats", () => {
  it("counts a small season correctly", () => {
    const st = computePlayerStats([
      s(21, 19), // clutch win
      s(21, 12), // comfortable win
      s(19, 21), // clutch loss
      s(10, 21), // heavy loss
    ]);
    expect(st.gamesPlayed).toBe(4);
    expect(st.wins).toBe(2);
    expect(st.losses).toBe(2);
    expect(st.pointsFor).toBe(71);
    expect(st.pointsAgainst).toBe(73);
    expect(st.pointsPlayed).toBe(144);
    expect(st.pointsPerGame).toBe(36);
    expect(st.avgPointsFor).toBe(71 / 4);
    expect(st.winPct).toBe(0.5);
    expect(st.forAgainstRatio).toBeCloseTo(71 / 73, 6);
    expect(st.clutchWins).toBe(1);
    expect(st.clutchLosses).toBe(1);
    expect(st.netClutch).toBe(0);
    expect(st.clutchRate).toBe(0.5);
  });

  it("treats a 2-point margin as clutch and 3 as not", () => {
    // The boundary is the whole definition — "by 2 points or less".
    const st = computePlayerStats([
      s(21, 19), // won by 2 -> clutch
      s(21, 18), // won by 3 -> not
      s(19, 21), // lost by 2 -> clutch
      s(18, 21), // lost by 3 -> not
    ]);
    expect(st.clutchWins).toBe(1);
    expect(st.clutchLosses).toBe(1);
  });

  it("counts a 1-point set as clutch", () => {
    const st = computePlayerStats([s(21, 20), s(20, 21)]);
    expect(st.clutchWins).toBe(1);
    expect(st.clutchLosses).toBe(1);
    expect(st.netClutch).toBe(0);
    expect(st.clutchRate).toBe(1);
  });

  it("honours a different clutch margin", () => {
    const sets = [s(21, 18), s(18, 21)];
    expect(computePlayerStats(sets).clutchWins).toBe(0);
    expect(computePlayerStats(sets, { clutchMargin: 3 }).clutchWins).toBe(1);
    expect(computePlayerStats(sets, { clutchMargin: 3 }).clutchLosses).toBe(1);
  });
});

describe("draws", () => {
  it("counts a level set as neither won nor lost", () => {
    // Softball's regular season can draw; volleyball never does.
    const st = computePlayerStats([s(21, 19), s(7, 7), s(10, 21)]);
    expect(st.wins).toBe(1);
    expect(st.losses).toBe(1);
    expect(st.draws).toBe(1);
    expect(st.gamesPlayed).toBe(3);
    // Still counts as a game played, so it dilutes win percentage.
    expect(st.winPct).toBeCloseTo(1 / 3, 6);
  });

  it("never counts a draw as clutch", () => {
    // "Won by 2 or fewer" needs a winner. A 0-point margin has neither.
    const st = computePlayerStats([s(7, 7), s(0, 0)]);
    expect(st.clutchWins).toBe(0);
    expect(st.clutchLosses).toBe(0);
    expect(st.netClutch).toBe(0);
    expect(st.clutchRate).toBe(0);
  });
});

describe("edge cases that would otherwise produce NaN", () => {
  it("returns zeros for a player who hasn't played", () => {
    const st = computePlayerStats([]);
    expect(st.gamesPlayed).toBe(0);
    expect(st.winPct).toBe(0);
    expect(st.avgPointsFor).toBe(0);
    expect(st.pointsPerGame).toBe(0);
    expect(st.forAgainstRatio).toBe(0);
    for (const v of Object.values(st)) expect(Number.isNaN(v)).toBe(false);
  });

  it("does not rank a flawless record as the worst one", () => {
    // Nothing conceded: the ratio is undefined, not zero. Returning 0 would
    // sort the best possible season below everyone else.
    const st = computePlayerStats([s(21, 0), s(21, 0)]);
    expect(st.forAgainstRatio).toBe(Infinity);
    expect(formatRatioPct(st.forAgainstRatio)).toBe("—");
  });

  it("handles never having scored", () => {
    const st = computePlayerStats([s(0, 21)]);
    expect(st.forAgainstRatio).toBe(0);
    expect(st.winPct).toBe(0);
  });
});

describe("matches the organizer's own spreadsheet", () => {
  // David Aitken's row: 138 games played, 74 wins, 22 clutch wins, 14 clutch
  // losses -> 53.6% win, +8 net clutch, 26% clutch rate. The count-derived
  // columns are reproduced exactly; the point totals here are synthetic, so
  // only the count columns are asserted against his published figures.
  const aitken = [
    ...many(22, s(25, 23)), // clutch wins
    ...many(52, s(25, 18)), // other wins
    ...many(14, s(23, 25)), // clutch losses
    ...many(50, s(18, 25)), // other losses
  ];

  it("reproduces his games played, wins and win percentage", () => {
    const st = computePlayerStats(aitken);
    expect(st.gamesPlayed).toBe(138);
    expect(st.wins).toBe(74);
    expect(formatPct(st.winPct)).toBe("53.6%");
  });

  it("reproduces his clutch line", () => {
    const st = computePlayerStats(aitken);
    expect(st.clutchWins).toBe(22);
    expect(st.clutchLosses).toBe(14);
    expect(st.netClutch).toBe(8);
    expect(formatSigned(st.netClutch)).toBe("+8");
    expect(formatRatioPct(st.clutchRate)).toBe("26%");
  });

  it("derives points played as both directions, not just yours", () => {
    // His row: 6249 points played over 138 games = 45.3 per game, while his
    // average points FOR is 22.5. The first is the whole set, the second is
    // only his half — conflating them was the easiest way to get this wrong.
    const st = computePlayerStats(aitken);
    expect(st.pointsPlayed).toBe(st.pointsFor + st.pointsAgainst);
    expect(st.pointsPerGame).toBeCloseTo(st.pointsPlayed / 138, 6);
    expect(st.avgPointsFor).toBeCloseTo(st.pointsFor / 138, 6);
    expect(st.pointsPerGame).toBeGreaterThan(st.avgPointsFor * 1.9);
  });
});

describe("ordering", () => {
  const row = (name: string, sets: SetResult[]) => ({
    name,
    stats: computePlayerStats(sets),
  });

  it("puts the most clutch first", () => {
    const rows = [
      row("loses close", [s(19, 21), s(19, 21)]),
      row("wins close", [s(21, 19), s(21, 19)]),
      row("never close", [s(21, 10), s(10, 21)]),
    ].sort(byNetClutch);
    expect(rows.map((r) => r.name)).toEqual([
      "wins close",
      "never close",
      "loses close",
    ]);
  });

  it("breaks a net-clutch tie on win percentage", () => {
    // Net clutch is a small integer over a season, so ties are common and the
    // tiebreak decides most of the table's actual order.
    const rows = [
      row("weaker", [s(21, 10), s(10, 21)]),
      row("stronger", [s(21, 10), s(21, 10)]),
    ].sort(byNetClutch);
    expect(rows[0].name).toBe("stronger");
    expect(rows[0].stats.netClutch).toBe(rows[1].stats.netClutch);
  });
});

describe("formatting", () => {
  it("renders a ratio the way the spreadsheet does", () => {
    expect(formatRatioPct(1.143)).toBe("114%");
    expect(formatRatioPct(0.99)).toBe("99%");
    expect(formatRatioPct(1)).toBe("100%");
  });

  it("renders a signed clutch figure", () => {
    expect(formatSigned(8)).toBe("+8");
    expect(formatSigned(-13)).toBe("-13");
    expect(formatSigned(0)).toBe("0");
  });

  it("renders percentages to one decimal", () => {
    expect(formatPct(0.5362)).toBe("53.6%");
    expect(formatPct(0.609)).toBe("60.9%");
  });
});
