import { describe, expect, it } from "vitest";

import {
  computeStats,
  headToHeadTable,
  rankStandings,
  type MatchResult,
  type TeamId,
} from "@/lib/scheduler/tiebreakers";

// 2-set games (v1): a match plays exactly 2 sets, ending 2–0 (win/loss) or
// 1–1 (a tie = half a win each). Best-of-3 can never tie.

function m(home: TeamId, away: TeamId, sets: [number, number][]): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
  };
}
const SWEEP: [number, number][] = [
  [21, 10],
  [21, 10],
]; // 2–0
const TIE: [number, number][] = [
  [21, 10],
  [10, 21],
]; // 1–1

describe("2-set ties in standings", () => {
  it("credits a 1–1 as a tie (half win) — not a win or a loss", () => {
    const s = computeStats(["A", "B"], [m("A", "B", TIE)]);
    expect(s.get("A")).toMatchObject({ mw: 0, ml: 0, mt: 1, sw: 1, sl: 1 });
    expect(s.get("B")).toMatchObject({ mw: 0, ml: 0, mt: 1, sw: 1, sl: 1 });
  });

  it("ranks a win + tie (1.5) above a win + loss (1.0)", () => {
    // A beats B 2–0; A ties C 1–1; B beats C 2–0.
    const teams = ["A", "B", "C"];
    const matches = [m("A", "B", SWEEP), m("A", "C", TIE), m("B", "C", SWEEP)];
    const ranked = rankStandings(teams, matches);
    const pos = Object.fromEntries(ranked.map((r) => [r.teamId, r.position]));
    expect(pos).toMatchObject({ A: 1, B: 2, C: 3 });
    // A finished first on 1 win + 1 tie (1.5), NOT on two wins.
    expect(ranked.find((r) => r.teamId === "A")).toMatchObject({
      mw: 1,
      mt: 1,
      ml: 0,
    });
  });

  it("head-to-head counts a tie as half a win each", () => {
    const h = headToHeadTable(["A", "B"], [m("A", "B", TIE)]);
    expect(h.find((e) => e.teamId === "A")).toMatchObject({
      wins: 0.5,
      played: 1,
    });
    expect(h.find((e) => e.teamId === "B")).toMatchObject({
      wins: 0.5,
      played: 1,
    });
  });

  it("best-of-3 results never tie (mt stays 0)", () => {
    const s = computeStats(
      ["A", "B"],
      [
        m("A", "B", [
          [25, 20],
          [20, 25],
          [15, 10],
        ]),
      ],
    );
    expect(s.get("A")).toMatchObject({ mw: 1, ml: 0, mt: 0 });
    expect(s.get("B")).toMatchObject({ mw: 0, ml: 1, mt: 0 });
  });
});
