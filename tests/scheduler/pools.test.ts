import { describe, expect, it } from "vitest";

import { assignPools, generatePools } from "@/lib/scheduler/pools";

function seeded(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

describe("assignPools — snake draft", () => {
  it("12 teams, poolSize 4 → 3 balanced pools, serpentine order", () => {
    const pools = assignPools(seeded(12), 4);
    expect(pools.map((p) => p.length)).toEqual([4, 4, 4]);
    expect(pools[0]).toEqual(["T1", "T6", "T7", "T12"]);
    expect(pools[1]).toEqual(["T2", "T5", "T8", "T11"]);
    expect(pools[2]).toEqual(["T3", "T4", "T9", "T10"]);
  });

  it("16 teams, poolSize 4 → 4 pools of 4", () => {
    const pools = assignPools(seeded(16), 4);
    expect(pools.map((p) => p.length)).toEqual([4, 4, 4, 4]);
    expect(pools[0]).toEqual(["T1", "T8", "T9", "T16"]);
    expect(pools[3]).toEqual(["T4", "T5", "T12", "T13"]);
  });

  it("reproduces the PRD example (4 pools: 1→A,2→B,3→C,4→D,5→D,6→C)", () => {
    // poolSize 2 over 8 teams → 4 pools.
    const pools = assignPools(seeded(8), 2);
    expect(pools).toHaveLength(4);
    expect(pools[0]).toEqual(["T1", "T8"]); // A: seed 1, 8
    expect(pools[1]).toEqual(["T2", "T7"]); // B: seed 2, 7
    expect(pools[2]).toEqual(["T3", "T6"]); // C: seed 3, 6
    expect(pools[3]).toEqual(["T4", "T5"]); // D: seed 4, 5
  });

  it("balances uneven counts (10 teams, poolSize 4 → 3/3/4)", () => {
    // 3 pools; the snake's overflow lands in the last pool — still balanced.
    const pools = assignPools(seeded(10), 4);
    expect(pools.map((p) => p.length)).toEqual([3, 3, 4]);
  });

  it("places every team exactly once with no duplicates", () => {
    const pools = assignPools(seeded(11), 4);
    const all = pools.flat();
    expect(all).toHaveLength(11);
    expect(new Set(all).size).toBe(11);
  });

  it("returns no pools for an empty field", () => {
    expect(assignPools([], 4)).toEqual([]);
  });
});

describe("generatePools — pools + within-pool round robin", () => {
  it("names pools A.. and assigns adjacent courts", () => {
    const { pools } = generatePools({ seededTeamIds: seeded(12), poolSize: 4 });
    expect(pools.map((p) => p.name)).toEqual(["Pool A", "Pool B", "Pool C"]);
    expect(pools.map((p) => p.court)).toEqual([1, 2, 3]);
  });

  it("each 4-team pool plays a full round robin (3 rounds, 6 matches)", () => {
    const { pools } = generatePools({ seededTeamIds: seeded(12), poolSize: 4 });
    for (const pool of pools) {
      expect(pool.rounds).toHaveLength(3);
      const pairs = pool.rounds.flatMap((r) =>
        r.pairs.map((p) => [p.homeTeamId, p.awayTeamId].sort().join("|")),
      );
      expect(pairs).toHaveLength(6);
      expect(new Set(pairs).size).toBe(6);
      // every pairing is within the pool
      for (const r of pool.rounds) {
        for (const p of r.pairs) {
          expect(pool.teamIds).toContain(p.homeTeamId);
          expect(pool.teamIds).toContain(p.awayTeamId);
        }
      }
    }
  });

  it("defaults poolSize to 4", () => {
    const { pools } = generatePools({ seededTeamIds: seeded(8) });
    expect(pools).toHaveLength(2);
    expect(pools.every((p) => p.teamIds.length === 4)).toBe(true);
  });

  it("handles a single small pool with a bye", () => {
    const { pools } = generatePools({ seededTeamIds: seeded(3), poolSize: 4 });
    expect(pools).toHaveLength(1);
    expect(pools[0].rounds).toHaveLength(3); // 3 teams → 3 rounds incl byes
    expect(pools[0].rounds.every((r) => r.byeTeamId !== null)).toBe(true);
  });

  it("returns no pools for an empty field", () => {
    expect(generatePools({ seededTeamIds: [] }).pools).toEqual([]);
  });
});
