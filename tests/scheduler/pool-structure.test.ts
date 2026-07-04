import { describe, expect, it } from "vitest";

import { generatePairings } from "@/lib/scheduler/round-robin";
import {
  detectCourtTimeCollisions,
  layoutPoolSchedule,
  poolPlan,
  resolveMatchFormat,
  resolveSeedOrder,
  snakeDraftIntoSizes,
  suggestPoolStructure,
  validatePoolStructure,
  type LayoutPool,
  type SeedTeam,
} from "@/lib/scheduler/pools";
import { toShortPoolFormat } from "@/lib/formats";
import type { MatchFormat } from "@/lib/db/schema";

function seeded(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

const STANDARD: MatchFormat = {
  bestOf: 3,
  setsToPoints: [25, 25, 15],
  winBy: 2,
};

const TWO_SET: MatchFormat = {
  bestOf: 2,
  setsToPoints: [21, 21],
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

describe("poolPlan", () => {
  it("3-team pool plays a double round-robin", () => {
    expect(poolPlan(3)).toEqual({ roundsPerTeam: 2 });
  });

  it("4- and 5-team pools play a single round-robin", () => {
    expect(poolPlan(4)).toEqual({ roundsPerTeam: 1 });
    expect(poolPlan(5)).toEqual({ roundsPerTeam: 1 });
  });
});

describe("resolveMatchFormat precedence", () => {
  const SHORT = toShortPoolFormat(TWO_SET);

  it("1. a pool's explicit override wins", () => {
    expect(resolveMatchFormat(SHORT, TWO_SET, STANDARD)).toBe(SHORT);
  });

  it("2. else the tournament's chosen pool format", () => {
    expect(resolveMatchFormat(null, TWO_SET, STANDARD)).toBe(TWO_SET);
    expect(resolveMatchFormat(undefined, TWO_SET, STANDARD)).toBe(TWO_SET);
  });

  it("3. else the competition base (bracket matches: no pool default)", () => {
    expect(resolveMatchFormat(null, null, STANDARD)).toBe(STANDARD);
    expect(resolveMatchFormat(undefined, undefined, STANDARD)).toBe(STANDARD);
  });
});

describe("2-set round-robin reaches the played format", () => {
  it("a 2-set choice yields bestOf:2 for a 3-team pool (no size override)", () => {
    // A 3-team pool plays a double round-robin, but "shorter games" is OFF by
    // default — so the pool carries no explicit override (null) and resolves to
    // the tournament's chosen 2-set format, not a size-based 15/11.
    expect(poolPlan(3).roundsPerTeam).toBe(2);
    const format = resolveMatchFormat(null, TWO_SET, STANDARD);
    expect(format.bestOf).toBe(2);
    expect(format.setsToPoints).toEqual([21, 21]);
  });

  it("toShortPoolFormat reduces to 2 sets to 15, preserving win-by and cap", () => {
    const capped: MatchFormat = {
      bestOf: 3,
      setsToPoints: [21, 21, 15],
      winBy: 2,
      capMinutes: 45,
    };
    expect(toShortPoolFormat(capped)).toEqual({
      bestOf: 2,
      setsToPoints: [15, 15],
      winBy: 2,
      capMinutes: 45,
    });
    // no cap on the base → no cap on the short variant
    expect(toShortPoolFormat(TWO_SET)).toEqual({
      bestOf: 2,
      setsToPoints: [15, 15],
      winBy: 2,
    });
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

describe("single pool spreads across courts (waves)", () => {
  function onePool(teamIds: string[]): LayoutPool[] {
    return [{ teamIds, rounds: generatePairings(teamIds, 1) }];
  }

  it("12 teams on 3 courts uses all 3, no collisions, no double-booked team", () => {
    const slots = layoutPoolSchedule(onePool(seeded(12)), 3);
    expect(detectCourtTimeCollisions(slots)).toEqual([]);

    // All three courts are used (the old behavior used only court 1).
    expect(new Set(slots.map((s) => s.court))).toEqual(new Set([1, 2, 3]));

    // No team plays two games in the same time slot.
    const bySlot = new Map<number, string[]>();
    for (const s of slots) {
      const list = bySlot.get(s.slot) ?? [];
      list.push(s.homeTeamId, s.awayTeamId);
      bySlot.set(s.slot, list);
    }
    for (const teams of bySlot.values()) {
      expect(new Set(teams).size).toBe(teams.length);
    }

    // Each team still plays a full round robin (11 games).
    const games = new Map<string, number>();
    for (const s of slots) {
      games.set(s.homeTeamId, (games.get(s.homeTeamId) ?? 0) + 1);
      games.set(s.awayTeamId, (games.get(s.awayTeamId) ?? 0) + 1);
    }
    expect([...games.values()].every((g) => g === 11)).toBe(true);
  });

  it("a referee is never playing in its own time slot", () => {
    const slots = layoutPoolSchedule(onePool(seeded(12)), 3);
    const playingInSlot = new Map<number, Set<string>>();
    for (const s of slots) {
      const set = playingInSlot.get(s.slot) ?? new Set<string>();
      set.add(s.homeTeamId);
      set.add(s.awayTeamId);
      playingInSlot.set(s.slot, set);
    }
    for (const s of slots) {
      if (s.refTeamId) {
        expect(playingInSlot.get(s.slot)!.has(s.refTeamId)).toBe(false);
      }
    }
    // With 12 teams on 3 courts every wave has idle teams — refs are assigned.
    expect(slots.every((s) => s.refTeamId !== null)).toBe(true);
  });

  it("keeps the single-court layout for a small pool (reffing preserved)", () => {
    // A pool of 4: floor(4/3)=1 court of spread → falls back to the
    // rest-optimized single-court block layout (all on court 1).
    const slots = layoutPoolSchedule(onePool(seeded(4)), 3);
    expect(new Set(slots.map((s) => s.court))).toEqual(new Set([1]));
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
