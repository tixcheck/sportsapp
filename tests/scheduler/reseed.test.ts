import { describe, expect, it } from "vitest";

import {
  pairHighLow,
  reseedByeCount,
  reseedFirstRound,
  reseedNextRound,
} from "@/lib/scheduler/reseed";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);

describe("pairHighLow", () => {
  it("pairs highest with lowest (1v last, 2v second-last)", () => {
    expect(pairHighLow(["S1", "S2", "S5", "S6"])).toEqual([
      { homeTeamId: "S1", awayTeamId: "S6" },
      { homeTeamId: "S2", awayTeamId: "S5" },
    ]);
  });

  it("the organizer's example: seeds 1,2,5,6 → 1v6, 2v5", () => {
    const pairs = pairHighLow(["S1", "S2", "S5", "S6"]);
    expect(pairs.map((p) => [p.homeTeamId, p.awayTeamId])).toEqual([
      ["S1", "S6"],
      ["S2", "S5"],
    ]);
  });

  it("the higher seed hosts", () => {
    const [p] = pairHighLow(["S1", "S8"]);
    expect(p).toEqual({ homeTeamId: "S1", awayTeamId: "S8" });
  });
});

describe("reseedByeCount / reseedFirstRound", () => {
  it("no byes for a power-of-two field", () => {
    expect(reseedByeCount(8)).toBe(0);
    const r = reseedFirstRound(seeds(8));
    expect(r.byes).toEqual([]);
    expect(r.matches).toHaveLength(4);
    // 1v8, 2v7, 3v6, 4v5
    expect(r.matches.map((m) => [m.homeTeamId, m.awayTeamId])).toEqual([
      ["S1", "S8"],
      ["S2", "S7"],
      ["S3", "S6"],
      ["S4", "S5"],
    ]);
  });

  it("6 teams: top 2 seeds bye, 3v6 and 4v5 play", () => {
    expect(reseedByeCount(6)).toBe(2);
    const r = reseedFirstRound(seeds(6));
    expect(r.byes).toEqual(["S1", "S2"]);
    expect(r.matches.map((m) => [m.homeTeamId, m.awayTeamId])).toEqual([
      ["S3", "S6"],
      ["S4", "S5"],
    ]);
  });

  it("5 teams: top 3 seeds bye, 4v5 plays", () => {
    expect(reseedByeCount(5)).toBe(3);
    const r = reseedFirstRound(seeds(5));
    expect(r.byes).toEqual(["S1", "S2", "S3"]);
    expect(r.matches.map((m) => [m.homeTeamId, m.awayTeamId])).toEqual([
      ["S4", "S5"],
    ]);
  });
});

describe("reseedNextRound", () => {
  const seedIndex = new Map(seeds(8).map((id, i) => [id, i]));

  it("survivors 1,2,5,6 → 1v6, 2v5 (re-ranked by seed)", () => {
    // Pass survivors in arbitrary order — output is by seed.
    const pairs = reseedNextRound(["S6", "S1", "S5", "S2"], seedIndex);
    expect(pairs.map((p) => [p.homeTeamId, p.awayTeamId])).toEqual([
      ["S1", "S6"],
      ["S2", "S5"],
    ]);
  });

  it("survivors 1,4 → the final 1v4", () => {
    expect(reseedNextRound(["S4", "S1"], seedIndex)).toEqual([
      { homeTeamId: "S1", awayTeamId: "S4" },
    ]);
  });
});
