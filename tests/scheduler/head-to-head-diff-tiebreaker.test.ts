import { describe, expect, it } from "vitest";

import {
  parseRankMode,
  rankStandings,
  rankingOrderText,
  type MatchResult,
} from "@/lib/scheduler/tiebreakers";

function m(home: string, away: string, sets: [number, number][]): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
  };
}

/**
 * Big Shoots (2026-10-08): "if there is a tie, it goes head to head and then
 * 2nd tie goes to points difference". Two-set games, so a 1–1 is a tie.
 */
describe("rankStandings — headToHeadDiff (Big Shoots)", () => {
  it("level on wins: the team that won the meeting is above", () => {
    // A and B finish on 2 wins each. A beat B, narrowly; B crushed the teams
    // it beat, so B has by far the better differential. The meeting decides.
    const two = (h: number, a: number): [number, number][] => [
      [h, a],
      [h, a],
    ];
    const games = [
      m("A", "B", two(25, 23)),
      m("A", "C", two(25, 23)),
      m("D", "A", two(25, 10)),
      m("B", "C", two(25, 5)),
      m("B", "D", two(25, 5)),
    ];
    const rows = rankStandings(
      ["A", "B", "C", "D"],
      games,
      undefined,
      "headToHeadDiff",
    );
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(["A", "B"]);
    expect(rows[0]).toMatchObject({ teamId: "A", tiebreakerStep: 2 });
  });

  it("meeting level: overall points difference decides, not the meeting's margin", () => {
    // A and B both 1 win, and they split their meeting 1–1 — B by the bigger
    // margin in it (+8 to A's +2). Over all their games A's differential is
    // better. Mango's headToHead picks B on the meeting's margin; Big Shoots'
    // rule picks A.
    const games = [
      m("A", "B", [
        [25, 23],
        [17, 25],
      ]),
      m("A", "C", [
        [25, 5],
        [25, 5],
      ]),
      m("B", "C", [
        [25, 23],
        [25, 23],
      ]),
      m("D", "A", [
        [25, 20],
        [25, 20],
      ]),
      m("D", "B", [
        [25, 20],
        [25, 20],
      ]),
    ];
    const teams = ["A", "B", "C", "D"];
    const rank = (mode: "headToHeadDiff" | "headToHead") =>
      rankStandings(teams, games, undefined, mode)
        .filter((r) => r.teamId === "A" || r.teamId === "B")
        .map((r) => r.teamId);
    expect(rank("headToHeadDiff")).toEqual(["A", "B"]);
    expect(rank("headToHead")).toEqual(["B", "A"]);
  });

  it("parses, and describes itself in the order it ranks", () => {
    expect(parseRankMode("headToHeadDiff")).toBe("headToHeadDiff");
    expect(parseRankMode("headToHeadDiff_projected")).toBe("headToHeadDiff");
    expect(
      rankingOrderText("headToHeadDiff", {
        unit: "matches",
        points: "point",
        sets: true,
      }),
    ).toBe(
      "matches won, then head-to-head among teams still tied, then point differential, then point ratio",
    );
    expect(
      rankingOrderText("ova", { unit: "matches", points: "point", sets: true }),
    ).toBe(
      "matches won, then set ratio, then point ratio, then head-to-head among teams still tied",
    );
  });
});
