import { describe, expect, it } from "vitest";

import {
  bracketParent,
  generateBracket,
  nextPowerOfTwo,
  seededBracketMatches,
  seedOrder,
} from "@/lib/scheduler/bracket";

function seeded(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `S${i + 1}`);
}

function firstRoundSeedPairs(
  teamIds: string[],
): [number | null, number | null][] {
  return generateBracket(teamIds).rounds[0].map((mt) => [
    mt.home.seed,
    mt.away.seed,
  ]);
}

describe("nextPowerOfTwo", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(9)).toBe(16);
    expect(nextPowerOfTwo(16)).toBe(16);
  });
});

describe("seedOrder", () => {
  it("produces the standard slot order", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("every first-round seed pair sums to size+1", () => {
    for (const size of [2, 4, 8, 16, 32]) {
      const order = seedOrder(size);
      for (let i = 0; i < size; i += 2) {
        expect(order[i] + order[i + 1]).toBe(size + 1);
      }
    }
  });
});

describe("generateBracket — full fields (power of two)", () => {
  it("16 teams: canonical first-round matchups, no byes", () => {
    expect(firstRoundSeedPairs(seeded(16))).toEqual([
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ]);
    const b = generateBracket(seeded(16));
    expect(b.size).toBe(16);
    expect(b.rounds[0].every((mt) => !mt.isBye)).toBe(true);
    expect(b.rounds).toHaveLength(4); // log2(16)
  });

  it("8 teams: 1v8, 4v5, 2v7, 3v6", () => {
    expect(firstRoundSeedPairs(seeded(8))).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    expect(generateBracket(seeded(8)).rounds).toHaveLength(3);
  });

  it("4 teams: 1v4, 2v3", () => {
    expect(firstRoundSeedPairs(seeded(4))).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });

  it("2 teams: a single final", () => {
    const b = generateBracket(seeded(2));
    expect(b.size).toBe(2);
    expect(firstRoundSeedPairs(seeded(2))).toEqual([[1, 2]]);
    expect(b.rounds).toHaveLength(1);
  });

  it("maps seeds to the supplied team ids", () => {
    const b = generateBracket(seeded(4));
    const first = b.rounds[0][0];
    expect(first.home).toEqual({ seed: 1, teamId: "S1" });
    expect(first.away).toEqual({ seed: 4, teamId: "S4" });
  });
});

describe("generateBracket — byes for top seeds", () => {
  it("6 teams: size 8, top 2 seeds get byes", () => {
    const b = generateBracket(seeded(6));
    expect(b.size).toBe(8);
    const byeMatches = b.rounds[0].filter((mt) => mt.isBye);
    expect(byeMatches).toHaveLength(8 - 6); // 2 byes

    // The real teams in bye matches are the top seeds (1 and 2).
    const byeSeeds = byeMatches
      .flatMap((mt) => [mt.home.seed, mt.away.seed])
      .filter((s): s is number => s !== null);
    expect(byeSeeds.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("5 teams: size 8, top 3 seeds get byes", () => {
    const b = generateBracket(seeded(5));
    expect(b.size).toBe(8);
    expect(b.rounds[0].filter((mt) => mt.isBye)).toHaveLength(3);
    const byeSeeds = b.rounds[0]
      .filter((mt) => mt.isBye)
      .flatMap((mt) => [mt.home.seed, mt.away.seed])
      .filter((s): s is number => s !== null)
      .sort((a, b) => a - b);
    expect(byeSeeds).toEqual([1, 2, 3]);
  });

  it("bye opponents are null entries", () => {
    const b = generateBracket(seeded(6));
    const topMatch = b.rounds[0][0];
    expect(topMatch.home).toEqual({ seed: 1, teamId: "S1" });
    expect(topMatch.away).toEqual({ seed: null, teamId: null });
  });
});

describe("generateBracket — degenerate fields", () => {
  it("0 or 1 team yields no rounds", () => {
    expect(generateBracket([]).rounds).toEqual([]);
    expect(generateBracket(seeded(1)).rounds).toEqual([]);
  });
});

describe("bracketParent", () => {
  it("maps child slots to the parent round / position / side", () => {
    expect(bracketParent(1, 1)).toEqual({
      round: 2,
      position: 1,
      slot: "home",
    });
    expect(bracketParent(1, 2)).toEqual({
      round: 2,
      position: 1,
      slot: "away",
    });
    expect(bracketParent(1, 3)).toEqual({
      round: 2,
      position: 2,
      slot: "home",
    });
    expect(bracketParent(1, 4)).toEqual({
      round: 2,
      position: 2,
      slot: "away",
    });
    expect(bracketParent(2, 1)).toEqual({
      round: 3,
      position: 1,
      slot: "home",
    });
  });
});

describe("seededBracketMatches", () => {
  it("8 teams: 4 R1 + 2 R2 + 1 final, no byes", () => {
    const ms = seededBracketMatches(seeded(8));
    const r1 = ms.filter((m) => m.round === 1);
    expect(r1).toHaveLength(4);
    expect(r1.every((m) => m.homeTeamId && m.awayTeamId)).toBe(true);
    expect(ms.filter((m) => m.round === 2)).toHaveLength(2);
    const final = ms.filter((m) => m.round === 3);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({ homeTeamId: null, awayTeamId: null });
  });

  it("5 teams: byes advance top seeds into round 2 (R1 phantom omitted)", () => {
    const ms = seededBracketMatches(["S1", "S2", "S3", "S4", "S5"]);
    const at = (r: number, p: number) =>
      ms.find((m) => m.round === r && m.position === p)!;
    // Only one real round-1 match: seed 4 (S4) vs seed 5 (S5).
    const r1 = ms.filter((m) => m.round === 1);
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ homeTeamId: "S4", awayTeamId: "S5" });
    // R2-1: top seed S1 awaits the S4/S5 winner.
    expect(at(2, 1)).toMatchObject({ homeTeamId: "S1", awayTeamId: null });
    // R2-2: two adjacent byes (S2, S3) -> playable immediately.
    expect(at(2, 2)).toMatchObject({ homeTeamId: "S2", awayTeamId: "S3" });
    // Final is a placeholder.
    expect(at(3, 1)).toMatchObject({ homeTeamId: null, awayTeamId: null });
  });

  it("2 teams: a single final match", () => {
    const ms = seededBracketMatches(["S1", "S2"]);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ round: 1, position: 1, homeTeamId: "S1" });
  });

  it("every persisted slot is unique by (round, position)", () => {
    const ms = seededBracketMatches(seeded(13));
    const keys = ms.map((m) => `${m.round}:${m.position}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
