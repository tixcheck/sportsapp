import { describe, expect, it } from "vitest";

import { generatePairings } from "@/lib/scheduler/round-robin";
import {
  detectCourtTimeCollisions,
  layoutPoolSchedule,
  poolPlan,
  resolveMatchFormat,
  resolveSeedOrder,
  SHORT_POOL_FORMAT,
  snakeDraftIntoSizes,
  suggestPoolStructure,
  validatePoolStructure,
  type LayoutPool,
  type SeedTeam,
} from "@/lib/scheduler/pools";
import type { MatchFormat } from "@/lib/db/schema";

function seeded(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

const STANDARD: MatchFormat = {
  bestOf: 3,
  setsToPoints: [25, 25, 15],
  winBy: 2,
};

describe("suggestPoolStructure", () => {
  it("matches the agreed examples", () => {
    expect(suggestPoolStructure(8)).toEqual([4, 4]);
    expect(suggestPoolStructure(9)).toEqual([4, 5]);
    expect(suggestPoolStructure(10)).toEqual([4, 3, 3]);
    expect(suggestPoolStructure(11)).toEqual([4, 4, 3]);
    expect(suggestPoolStructure(12)).toEqual([4, 4, 4]);
    expect(suggestPoolStructure(6)).toEqual([3, 3]);
    expect(suggestPoolStructure(7)).toEqual([4, 3]);
    expect(suggestPoolStructure(5)).toEqual([5]);
    expect(suggestPoolStructure(3)).toEqual([3]);
  });

  it("never produces a 2-team pool for n ≥ 3, and always sums to n", () => {
    for (let n = 3; n <= 60; n++) {
      const sizes = suggestPoolStructure(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(sizes.every((s) => s !== 2)).toBe(true);
      expect(sizes.every((s) => s >= 3 && s <= 5)).toBe(true);
    }
  });

  it("handles degenerate counts", () => {
    expect(suggestPoolStructure(0)).toEqual([]);
    expect(suggestPoolStructure(1)).toEqual([1]);
    expect(suggestPoolStructure(2)).toEqual([2]);
  });
});

describe("validatePoolStructure", () => {
  it("errors when sizes don't sum to the team count", () => {
    const r = validatePoolStructure([4, 4], 10);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("10");
  });

  it("accepts a valid structure with no warnings", () => {
    const r = validatePoolStructure([4, 3, 3], 10);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it("warns (does not block) on weak ≤2-team pools", () => {
    const r = validatePoolStructure([4, 2, 2], 8);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("2 or fewer");
  });

  it("rejects a non-positive pool", () => {
    expect(validatePoolStructure([4, 0], 4).ok).toBe(false);
  });
});

describe("snakeDraftIntoSizes", () => {
  it("respects uneven sizes, places each team once, balances by strength", () => {
    const pools = snakeDraftIntoSizes(seeded(10), [4, 3, 3]);
    expect(pools.map((p) => p.length)).toEqual([4, 3, 3]);
    // serpentine: row0 L→R, row1 R→L, …
    expect(pools[0]).toEqual(["T1", "T6", "T7", "T10"]);
    expect(pools[1]).toEqual(["T2", "T5", "T8"]);
    expect(pools[2]).toEqual(["T3", "T4", "T9"]);
    // every team placed exactly once
    expect(pools.flat().sort()).toEqual(seeded(10).sort());
  });

  it("equal sizes match the classic serpentine", () => {
    const pools = snakeDraftIntoSizes(seeded(12), [4, 4, 4]);
    expect(pools[0]).toEqual(["T1", "T6", "T7", "T12"]);
    expect(pools[1]).toEqual(["T2", "T5", "T8", "T11"]);
    expect(pools[2]).toEqual(["T3", "T4", "T9", "T10"]);
  });
});

describe("poolPlan + resolveMatchFormat", () => {
  it("3-team → double RR + short format", () => {
    const p = poolPlan(3);
    expect(p.roundsPerTeam).toBe(2);
    expect(p.suggestedFormat).toEqual(SHORT_POOL_FORMAT);
  });

  it("4-team → single RR + standard (null) format", () => {
    expect(poolPlan(4)).toEqual({ roundsPerTeam: 1, suggestedFormat: null });
  });

  it("5+-team → single RR + short format", () => {
    const p = poolPlan(5);
    expect(p.roundsPerTeam).toBe(1);
    expect(p.suggestedFormat).toEqual(SHORT_POOL_FORMAT);
  });

  it("resolveMatchFormat prefers the pool override", () => {
    expect(resolveMatchFormat(SHORT_POOL_FORMAT, STANDARD)).toBe(
      SHORT_POOL_FORMAT,
    );
    expect(resolveMatchFormat(null, STANDARD)).toBe(STANDARD);
    expect(resolveMatchFormat(undefined, STANDARD)).toBe(STANDARD);
  });
});

describe("3-team double round-robin gives equal games per team", () => {
  it("each team plays 4 matches (2 opponents × 2)", () => {
    const rounds = generatePairings(["A", "B", "C"], poolPlan(3).roundsPerTeam);
    const games = new Map<string, number>();
    for (const r of rounds) {
      for (const p of r.pairs) {
        games.set(p.homeTeamId, (games.get(p.homeTeamId) ?? 0) + 1);
        games.set(p.awayTeamId, (games.get(p.awayTeamId) ?? 0) + 1);
      }
    }
    expect([...games.values()]).toEqual([4, 4, 4]);
  });
});

describe("court/time invariant holds after structuring", () => {
  function buildPools(sizes: number[], teamIds: string[]): LayoutPool[] {
    return snakeDraftIntoSizes(teamIds, sizes).map((ids) => ({
      teamIds: ids,
      rounds: generatePairings(ids, poolPlan(ids.length).roundsPerTeam),
    }));
  }

  it("no collisions with a double-RR short pool, one court per pool", () => {
    const slots = layoutPoolSchedule(buildPools([4, 3, 3], seeded(10)), 3);
    expect(detectCourtTimeCollisions(slots)).toEqual([]);
  });

  it("no collisions when pools share courts in waves (fewer courts)", () => {
    const slots = layoutPoolSchedule(buildPools([4, 3, 3], seeded(10)), 2);
    expect(detectCourtTimeCollisions(slots)).toEqual([]);
  });
});

describe("seed preservation when a team is removed", () => {
  it("survivors keep their relative seed order", () => {
    const teams: SeedTeam[] = [1, 2, 3, 4, 5].map((s) => ({
      id: `T${s}`,
      divisionId: "d",
      seed: s,
    }));
    // remove T3, regenerate from persisted seeds (no manual hint)
    const survivors = teams.filter((t) => t.id !== "T3");
    const order = resolveSeedOrder(survivors);
    expect(order["d"]).toEqual(["T1", "T2", "T4", "T5"]);
  });
});
