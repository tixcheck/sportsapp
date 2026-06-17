import { describe, expect, it } from "vitest";

import {
  assignPools,
  detectCourtTimeCollisions,
  generatePools,
  layoutPoolSchedule,
  resolveSeedOrder,
  type SeedTeam,
} from "@/lib/scheduler/pools";

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

describe("resolveSeedOrder — pool team selection", () => {
  // Claim/invite status is not an input, so unclaimed teams are always included.
  it("includes every team with an empty hint (all-unclaimed, stale client)", () => {
    const teams: SeedTeam[] = [
      { id: "a", divisionId: "D", seed: null },
      { id: "b", divisionId: "D", seed: null },
      { id: "c", divisionId: "D", seed: null },
    ];
    expect(resolveSeedOrder(teams, {})).toEqual({ D: ["a", "b", "c"] });
  });

  it("orders by seed when there is no hint", () => {
    const teams: SeedTeam[] = [
      { id: "a", divisionId: "D", seed: 3 },
      { id: "b", divisionId: "D", seed: 1 },
      { id: "c", divisionId: "D", seed: 2 },
    ];
    expect(resolveSeedOrder(teams, {})).toEqual({ D: ["b", "c", "a"] });
  });

  it("honors the hint order and appends teams missing from the hint", () => {
    const teams: SeedTeam[] = [
      { id: "a", divisionId: "D", seed: 1 },
      { id: "b", divisionId: "D", seed: 2 },
      { id: "c", divisionId: "D", seed: 3 },
      { id: "d", divisionId: "D", seed: 4 },
    ];
    // Organizer ordered b,a; c and d weren't in the (stale) hint → still included.
    expect(resolveSeedOrder(teams, { D: ["b", "a"] })).toEqual({
      D: ["b", "a", "c", "d"],
    });
  });

  it("ignores hint ids not in the division and dedupes", () => {
    const teams: SeedTeam[] = [
      { id: "a", divisionId: "D", seed: 1 },
      { id: "b", divisionId: "D", seed: 2 },
    ];
    expect(resolveSeedOrder(teams, { D: ["a", "a", "zzz", "b"] })).toEqual({
      D: ["a", "b"],
    });
  });

  it("groups by division", () => {
    const teams: SeedTeam[] = [
      { id: "a", divisionId: "D1", seed: 2 },
      { id: "b", divisionId: "D2", seed: 1 },
      { id: "c", divisionId: "D1", seed: 1 },
    ];
    expect(resolveSeedOrder(teams, {})).toEqual({ D1: ["c", "a"], D2: ["b"] });
  });

  it("groups teams without a division under the empty key", () => {
    expect(
      resolveSeedOrder([{ id: "a", divisionId: null, seed: 1 }], {}),
    ).toEqual({ "": ["a"] });
  });
});

describe("layoutPoolSchedule — court/time assignment", () => {
  function buildPools(n: number, poolSize = 4) {
    return generatePools({ seededTeamIds: seeded(n), poolSize }).pools.map(
      (p) => ({ teamIds: p.teamIds, rounds: p.rounds }),
    );
  }

  it("lays one pool's matches sequentially on a single court", () => {
    const matches = layoutPoolSchedule(buildPools(4, 4), 3);
    expect(matches).toHaveLength(6); // 4-team RR
    expect(matches.every((m) => m.court === 1)).toBe(true);
    expect(matches.map((m) => m.slot).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("runs different pools on different courts in parallel", () => {
    const matches = layoutPoolSchedule(buildPools(8, 4), 2);
    const p0 = matches.filter((m) => m.poolIndex === 0);
    const p1 = matches.filter((m) => m.poolIndex === 1);
    expect(p0.every((m) => m.court === 1)).toBe(true);
    expect(p1.every((m) => m.court === 2)).toBe(true);
    // Both pools start at slot 0 (simultaneous first matches).
    expect(Math.min(...p0.map((m) => m.slot))).toBe(0);
    expect(Math.min(...p1.map((m) => m.slot))).toBe(0);
  });

  it("queues pools into later waves when they outnumber courts", () => {
    const matches = layoutPoolSchedule(buildPools(12, 4), 2); // 3 pools, 2 courts
    const p2 = matches.filter((m) => m.poolIndex === 2);
    // Pool C shares Court 1 with Pool A → starts after A's 6 matches (slot 6).
    expect(p2.every((m) => m.court === 1)).toBe(true);
    expect(Math.min(...p2.map((m) => m.slot))).toBe(6);
  });

  it("has zero court/time collisions (multi-pool, multi-court)", () => {
    expect(
      detectCourtTimeCollisions(layoutPoolSchedule(buildPools(12, 4), 3)),
    ).toEqual([]);
    expect(
      detectCourtTimeCollisions(layoutPoolSchedule(buildPools(12, 4), 2)),
    ).toEqual([]);
    expect(
      detectCourtTimeCollisions(layoutPoolSchedule(buildPools(16, 4), 3)),
    ).toEqual([]);
  });

  it("assigns every match a ref in the pool and not playing", () => {
    const pools = buildPools(12, 4);
    const matches = layoutPoolSchedule(pools, 3);
    for (const m of matches) {
      const pool = pools[m.poolIndex];
      expect(m.refTeamId).not.toBeNull();
      expect(pool.teamIds).toContain(m.refTeamId);
      expect(m.refTeamId).not.toBe(m.homeTeamId);
      expect(m.refTeamId).not.toBe(m.awayTeamId);
    }
  });
});

describe("detectCourtTimeCollisions", () => {
  it("flags a court+slot used twice", () => {
    expect(
      detectCourtTimeCollisions([
        { court: 1, slot: 0 },
        { court: 2, slot: 0 },
        { court: 1, slot: 0 },
      ]),
    ).toEqual([{ court: 1, slot: 0 }]);
  });

  it("returns nothing when all court+slot pairs are unique", () => {
    expect(
      detectCourtTimeCollisions([
        { court: 1, slot: 0 },
        { court: 1, slot: 1 },
        { court: 2, slot: 0 },
      ]),
    ).toEqual([]);
  });
});
