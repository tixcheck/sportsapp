import { describe, expect, it } from "vitest";

import {
  crossPoolSeedOrder,
  rankStandings,
  type MatchResult,
  type TeamId,
} from "@/lib/scheduler/tiebreakers";

function m(home: TeamId, away: TeamId, sets: [number, number][]): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
  };
}

describe("crossPoolSeedOrder", () => {
  it("interleaves by finishing position: all winners, then all runners-up", () => {
    // Two clean 2-team pools; winners A1, B1; runners A2, B2.
    const poolA = rankStandings(
      ["A1", "A2"],
      [
        m("A1", "A2", [
          [25, 20],
          [25, 20],
        ]),
      ],
    );
    const poolB = rankStandings(
      ["B1", "B2"],
      [
        m("B1", "B2", [
          [25, 18],
          [25, 18],
        ]),
      ],
    );
    const order = crossPoolSeedOrder([poolA, poolB]);
    // winners occupy seeds 1–2, runners-up seeds 3–4
    expect(new Set([order[0], order[1]])).toEqual(new Set(["A1", "B1"]));
    expect(new Set([order[2], order[3]])).toEqual(new Set(["A2", "B2"]));
  });

  it("ranks mixed-format pool winners by ratio, not raw points", () => {
    // Pool STD ran to 25; its winner scores big raw totals.
    const std = rankStandings(
      ["S1", "S2"],
      [
        m("S1", "S2", [
          [25, 20],
          [25, 20],
        ]), // S1 PF/PA = 50/40 = 1.25
      ],
    );
    // Pool SHORT ran to 15; smaller raw totals but a higher ratio.
    const short = rankStandings(
      ["H1", "H2"],
      [
        m("H1", "H2", [
          [15, 5],
          [15, 5],
        ]), // H1 PF/PA = 30/10 = 3.0
      ],
    );
    // Both winners swept (set ratio ∞), so point ratio decides: H1 (3.0) > S1
    // (1.25) — even though S1 scored far more raw points.
    const order = crossPoolSeedOrder([std, short]);
    expect(order[0]).toBe("H1");
    expect(order[1]).toBe("S1");
  });

  it("handles uneven pool sizes (a short pool runs out of positions)", () => {
    const big = rankStandings(
      ["A", "B", "C"],
      [
        m("A", "B", [
          [25, 10],
          [25, 10],
        ]),
        m("A", "C", [
          [25, 12],
          [25, 12],
        ]),
        m("B", "C", [
          [25, 20],
          [25, 20],
        ]),
      ],
    );
    const small = rankStandings(
      ["X", "Y"],
      [
        m("X", "Y", [
          [25, 15],
          [25, 15],
        ]),
      ],
    );
    const order = crossPoolSeedOrder([big, small]);
    // 5 teams total, no duplicates, C (3rd in big) lands last with no peer.
    expect(order).toHaveLength(5);
    expect(new Set(order).size).toBe(5);
    expect(order[order.length - 1]).toBe("C");
  });
});
