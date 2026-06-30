import { describe, expect, it } from "vitest";

import {
  computeKotcSeeds,
  evenPoolSizes,
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

  it("is comparable across unequal pool sizes (7-pool vs 8-pool)", () => {
    // Endpoints map identically regardless of size…
    expect(normalizedPlacement(1, 8)).toBe(normalizedPlacement(1, 7)); // both 1.0
    expect(normalizedPlacement(8, 8)).toBe(normalizedPlacement(7, 7)); // both 0.0
    // …and a 4th-of-8 (beat 4) outranks a 4th-of-7 (beat 3).
    expect(normalizedPlacement(4, 8)).toBeGreaterThan(
      normalizedPlacement(4, 7),
    );
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

  it("seeds fairly across UNEQUAL pool sizes in a round (8-pool vs 7-pool)", () => {
    // One seeding round, 15 pairs split 8 + 7. The pure metric must put the two
    // pool winners on equal footing despite the size difference.
    const seeds = computeKotcSeeds([
      stage(
        ["A1", 1, 8, 20],
        ["A2", 2, 8, 18],
        ["A3", 3, 8, 16],
        ["A4", 4, 8, 14],
        ["A5", 5, 8, 12],
        ["A6", 6, 8, 10],
        ["A7", 7, 8, 8],
        ["A8", 8, 8, 6],
        ["B1", 1, 7, 19],
        ["B2", 2, 7, 17],
        ["B3", 3, 7, 15],
        ["B4", 4, 7, 13],
        ["B5", 5, 7, 11],
        ["B6", 6, 7, 9],
        ["B7", 7, 7, 7],
      ),
    ]);
    const get = (t: string) => seeds.find((s) => s.teamId === t)!;
    // Both pool winners → 1.0; both last places → 0.0 (size-normalized).
    expect(get("A1").seedScore).toBe(1);
    expect(get("B1").seedScore).toBe(1);
    expect(get("A8").seedScore).toBe(0);
    expect(get("B7").seedScore).toBe(0);
    // A4 (4th of 8) outranks B4 (4th of 7).
    expect(get("A4").seedScore).toBeGreaterThan(get("B4").seedScore);
    // The two winners tie on score; the tie breaks to more total points (A1=20).
    expect(get("A1").seedRank).toBe(1);
    expect(get("B1").seedRank).toBe(2);
  });
});

describe("evenPoolSizes", () => {
  it("splits clean and uneven counts sensibly", () => {
    expect(evenPoolSizes(15, 5)).toEqual([5, 5, 5]);
    expect(evenPoolSizes(15, 4)).toEqual([4, 4, 4, 3]); // larger pools first
    expect(evenPoolSizes(14, 5)).toEqual([5, 5, 4]);
    expect(evenPoolSizes(16, 4)).toEqual([4, 4, 4, 4]);
    expect(evenPoolSizes(3, 5)).toEqual([3]); // fewer than one pool's worth
  });

  it("always sums to the total, spread ≤ 1, no empty pool", () => {
    for (let total = 2; total <= 40; total++) {
      for (const per of [3, 4, 5, 6]) {
        const sizes = evenPoolSizes(total, per);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1);
      }
    }
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

  it("handles 15 seeds into uneven pools [4,4,4,3]", () => {
    const order = Array.from({ length: 15 }, (_, i) => `S${i + 1}`);
    const sizes = evenPoolSizes(15, 4); // [4,4,4,3]
    const pools = seedElimination(order, sizes);
    expect(pools.map((p) => p.length)).toEqual([4, 4, 4, 3]);
    expect(pools.flat().sort()).toEqual([...order].sort());
    // Each pool's pairs are distinct and every seed is placed exactly once.
    expect(new Set(pools.flat()).size).toBe(15);
  });
});
