import { describe, expect, it } from "vitest";

import {
  computeStats,
  headToHeadTable,
  rankStandings,
  type MatchResult,
  type TeamId,
} from "@/lib/scheduler/tiebreakers";

/**
 * The v1 "drop a game" rule: a dropped match is excluded from the DROPPING
 * team's record only — it still counts in full for the opponent. These tests
 * pin that asymmetry down at the pure-function level.
 */

/** Build an identified match; pass set tuples [home, away]. */
function m(
  id: string,
  home: TeamId,
  away: TeamId,
  sets: [number, number][],
): MatchResult {
  return {
    matchId: id,
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
  };
}

const SWEEP: [number, number][] = [
  [21, 10],
  [21, 10],
];

describe("computeStats — per-team drop", () => {
  // A beat B (m1); C beat A (m2). A drops its loss to C.
  const teams = ["A", "B", "C"];
  const matches = [
    m("m1", "A", "B", SWEEP),
    m("m2", "C", "A", [
      [21, 15],
      [21, 15],
    ]),
  ];

  it("excludes the dropped game from the dropping team's record", () => {
    const base = computeStats(teams, matches);
    expect(base.get("A")).toMatchObject({
      mw: 1,
      ml: 1,
      sw: 2,
      sl: 2,
      pf: 72,
      pa: 62,
    });

    const dropped = computeStats(teams, matches, new Map([["A", "m2"]]));
    // The loss to C is gone from A entirely — wins, losses, sets and points.
    expect(dropped.get("A")).toMatchObject({
      mw: 1,
      ml: 0,
      sw: 2,
      sl: 0,
      pf: 42,
      pa: 20,
    });
  });

  it("keeps the dropped game counting in full for the opponent", () => {
    const base = computeStats(teams, matches);
    const dropped = computeStats(teams, matches, new Map([["A", "m2"]]));
    // C beat A — that win must be untouched by A's drop.
    expect(dropped.get("C")).toEqual(base.get("C"));
    expect(dropped.get("C")).toMatchObject({ mw: 1, ml: 0, sw: 2, sl: 0 });
    // An uninvolved team is untouched too.
    expect(dropped.get("B")).toEqual(base.get("B"));
  });

  it("is a no-op when the map is empty", () => {
    expect(computeStats(teams, matches, new Map())).toEqual(
      computeStats(teams, matches),
    );
  });
});

describe("headToHeadTable — per-team drop", () => {
  it("drops the game for the dropper but keeps it for the opponent", () => {
    const matches = [m("x", "A", "B", SWEEP)]; // A beat B
    const base = headToHeadTable(["A", "B"], matches);
    expect(base.find((e) => e.teamId === "A")).toMatchObject({
      wins: 1,
      played: 1,
    });

    const h = headToHeadTable(["A", "B"], matches, new Map([["A", "x"]]));
    // A no longer counts the game at all; B still counts having played it.
    expect(h.find((e) => e.teamId === "A")).toMatchObject({
      wins: 0,
      played: 0,
    });
    expect(h.find((e) => e.teamId === "B")).toMatchObject({
      wins: 0,
      played: 1,
    });
  });
});

describe("rankStandings — per-team drop", () => {
  // D sweeps the field (2-0). A and B each go 1-1; B outranks A on set ratio.
  // A drops its heavy loss to D, which lifts A above B — while D keeps the win.
  const teams = ["A", "B", "C", "D"];
  const matches = [
    m("ac", "A", "C", SWEEP), // A 2-0
    m("da", "D", "A", SWEEP), // A loses 0-2  (A drops this)
    m("bc", "B", "C", SWEEP), // B 2-0
    m("db", "D", "B", [
      [21, 10],
      [19, 21],
      [21, 15],
    ]), // B loses 1-2
  ];

  const positions = (rows: { teamId: string; position: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.teamId, r.position]));

  it("ranks B above A on set ratio with no drops", () => {
    expect(positions(rankStandings(teams, matches))).toMatchObject({
      D: 1,
      B: 2,
      A: 3,
      C: 4,
    });
  });

  it("lifts A above B once A drops its loss, opponent's win intact", () => {
    const ranked = rankStandings(teams, matches, new Map([["A", "da"]]));
    expect(positions(ranked)).toMatchObject({ D: 1, A: 2, B: 3, C: 4 });

    // A's loss is gone; D's win over A is retained.
    expect(ranked.find((r) => r.teamId === "A")).toMatchObject({
      mw: 1,
      ml: 0,
    });
    expect(ranked.find((r) => r.teamId === "D")).toMatchObject({ mw: 2 });
  });

  it("an empty drop map is identical to no drops", () => {
    expect(rankStandings(teams, matches, new Map())).toEqual(
      rankStandings(teams, matches),
    );
  });
});
