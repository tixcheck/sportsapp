import { describe, expect, it } from "vitest";

import {
  advancementCutoffTies,
  rankStandings,
  selectAdvancers,
  type MatchResult,
  type StandingRow,
  type TeamId,
} from "@/lib/scheduler/tiebreakers";

function m(home: TeamId, away: TeamId, sets: [number, number][]): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
  };
}
const SWEEP: [number, number][] = [
  [25, 10],
  [25, 10],
];

/** Minimal StandingRow for tie-detection tests. */
function row(
  teamId: TeamId,
  position: number,
  step: 1 | 2 | 3 | 4 | 5,
  tiedWith: TeamId[],
  setRatio = 1,
  pointRatio = 1,
): StandingRow {
  return {
    teamId,
    mw: 0,
    ml: 0,
    mt: 0,
    sw: 0,
    sl: 0,
    pf: 0,
    pa: 0,
    setRatio,
    pointRatio,
    position,
    projected: false,
    tiebreakerStep: step,
    tiebreakerValue: 0,
    tiedWith,
    explanation: "",
  };
}

describe("selectAdvancers", () => {
  // Two pools; each pool's winner sweeps, runner-up loses.
  const poolA = rankStandings(["A1", "A2"], [m("A1", "A2", SWEEP)]);
  const poolB = rankStandings(["B1", "B2"], [m("B1", "B2", SWEEP)]);

  it("perPool top 1 advances both pool winners", () => {
    const seeds = selectAdvancers([poolA, poolB], "perPool", 1);
    expect(new Set(seeds)).toEqual(new Set(["A1", "B1"]));
    expect(seeds).toHaveLength(2);
  });

  it("perPool top 2 advances everyone, winners seeded ahead of runners-up", () => {
    const seeds = selectAdvancers([poolA, poolB], "perPool", 2);
    expect(seeds).toHaveLength(4);
    expect(new Set([seeds[0], seeds[1]])).toEqual(new Set(["A1", "B1"]));
    expect(new Set([seeds[2], seeds[3]])).toEqual(new Set(["A2", "B2"]));
  });

  it("overall top 2 takes the best two across pools (the winners)", () => {
    const seeds = selectAdvancers([poolA, poolB], "overall", 2);
    expect(new Set(seeds)).toEqual(new Set(["A1", "B1"]));
  });
});

describe("advancementCutoffTies", () => {
  it("flags a step-5 pool tie straddling the cutoff", () => {
    // Pool: clear 1st, then B & C unresolved-tied at positions 2 & 3.
    const pool = [
      row("A", 1, 1, ["A"]),
      row("B", 2, 5, ["B", "C"]),
      row("C", 3, 5, ["B", "C"]),
    ];
    const ties = advancementCutoffTies([pool], "perPool", 2);
    expect(ties).toHaveLength(1);
    expect([...ties[0]].sort()).toEqual(["B", "C"]);
  });

  it("is clean when the cutoff doesn't split a tie", () => {
    const pool = [
      row("A", 1, 1, ["A"]),
      row("B", 2, 3, ["B"]),
      row("C", 3, 3, ["C"]),
    ];
    expect(advancementCutoffTies([pool], "perPool", 2)).toEqual([]);
    // n=1 cutoff is between A and B (not tied) → clean.
    expect(advancementCutoffTies([pool], "perPool", 1)).toEqual([]);
  });

  it("flags a cross-pool dead heat at the overall cutoff", () => {
    // Two pool winners with identical ratios → ambiguous at n=1.
    const a = [row("A1", 1, 1, ["A1"], 2, 1.5)];
    const b = [row("B1", 1, 1, ["B1"], 2, 1.5)];
    const ties = advancementCutoffTies([a, b], "overall", 1);
    expect(ties).toHaveLength(1);
    expect([...ties[0]].sort()).toEqual(["A1", "B1"]);
  });
});
