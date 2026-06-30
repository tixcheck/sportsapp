import { describe, expect, it } from "vitest";

import {
  computeKotcSeeds,
  normalizedPlacement,
  seedElimination,
  type StagePlacement,
} from "@/lib/kotc/seed";

describe("normalizedPlacement", () => {
  it("maps 1st→1.0 and last→0.0 regardless of pool size", () => {
    expect(normalizedPlacement(1, 6)).toBe(1);
    expect(normalizedPlacement(6, 6)).toBe(0);
    expect(normalizedPlacement(1, 3)).toBe(1);
    expect(normalizedPlacement(3, 3)).toBe(0);
  });

  it("makes a deeper finish in a bigger pool worth more (size-normalized)", () => {
    // 2nd of 6 is a harder/better result than 2nd of 3.
    expect(normalizedPlacement(2, 6)).toBeGreaterThan(
      normalizedPlacement(2, 3),
    );
  });

  it("treats a 1-pair pool as 1.0", () => {
    expect(normalizedPlacement(1, 1)).toBe(1);
  });
});

describe("computeKotcSeeds", () => {
  const stage = (
    ...rows: [string, number, number, number][] // [team, rank, poolSize, pts]
  ): StagePlacement[] =>
    rows.map(([teamId, rank, poolSize, kingPoints]) => ({
      teamId,
      rank,
      poolSize,
      kingPoints,
    }));

  it("averages normalized placement across the two seeding rounds", () => {
    const seeds = computeKotcSeeds([
      stage(["A", 1, 4, 12], ["B", 2, 4, 10], ["C", 3, 4, 6], ["D", 4, 4, 3]),
      stage(["A", 1, 4, 11], ["B", 2, 4, 9], ["C", 3, 4, 5], ["D", 4, 4, 2]),
    ]);
    expect(seeds.map((s) => s.teamId)).toEqual(["A", "B", "C", "D"]);
    expect(seeds[0].seedScore).toBe(1); // A: (1.0 + 1.0)/2
    expect(seeds[0].seedRank).toBe(1);
  });

  it("breaks an equal-seed-score tie by total points", () => {
    // A 1st then 4th; D 4th then 1st → both average to 0.5. A scored more total.
    const seeds = computeKotcSeeds([
      stage(["A", 1, 4, 20], ["B", 2, 4, 8], ["C", 3, 4, 6], ["D", 4, 4, 1]),
      stage(["D", 1, 4, 9], ["C", 2, 4, 7], ["B", 3, 4, 5], ["A", 4, 4, 2]),
    ]);
    const a = seeds.find((s) => s.teamId === "A")!;
    const d = seeds.find((s) => s.teamId === "D")!;
    expect(a.seedScore).toBeCloseTo(0.5);
    expect(d.seedScore).toBeCloseTo(0.5);
    expect(a.seedRank).toBeLessThan(d.seedRank); // A's higher total points wins
  });

  it("is deterministic", () => {
    const s = [
      stage(["A", 1, 3, 5], ["B", 2, 3, 4], ["C", 3, 3, 2]),
      stage(["C", 1, 3, 6], ["A", 2, 3, 3], ["B", 3, 3, 1]),
    ];
    expect(computeKotcSeeds(s)).toEqual(computeKotcSeeds(s));
  });
});

describe("seedElimination", () => {
  it("serpentines the seed order into the given pool sizes", () => {
    const pools = seedElimination(["A", "B", "C", "D", "E", "F"], [3, 3]);
    expect(pools.map((p) => p.length)).toEqual([3, 3]);
    expect(pools.flat().sort()).toEqual(["A", "B", "C", "D", "E", "F"]);
    // Top two seeds land in different pools (serpentine spreads strength).
    expect(pools[0][0]).toBe("A");
    expect(pools[1][0]).toBe("B");
  });
});
