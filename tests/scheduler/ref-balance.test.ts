import { describe, expect, it } from "vitest";

import {
  assignPoolRefs,
  layoutPoolSchedule,
  poolPlan,
  type LayoutPool,
} from "@/lib/scheduler/pools";
import { generatePairings } from "@/lib/scheduler/round-robin";

function buildPool(size: number): LayoutPool {
  const teamIds = Array.from({ length: size }, (_, i) => `T${i + 1}`);
  return {
    teamIds,
    rounds: generatePairings(teamIds, poolPlan(size).roundsPerTeam),
  };
}

/** Ref count per team (teams that never ref count as 0). */
function refCounts(size: number): number[] {
  const counts = new Map<string, number>(
    Array.from({ length: size }, (_, i) => [`T${i + 1}`, 0]),
  );
  for (const s of layoutPoolSchedule([buildPool(size)], 1)) {
    if (s.refTeamId) counts.set(s.refTeamId, counts.get(s.refTeamId)! + 1);
  }
  return [...counts.values()];
}

describe("ref load balancing", () => {
  for (const size of [3, 4, 5, 6]) {
    it(`a ${size}-team pool's ref counts differ by at most 1`, () => {
      const counts = refCounts(size);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });
  }

  it("no team ever refs a match it plays", () => {
    for (const size of [3, 4, 5, 6]) {
      for (const s of layoutPoolSchedule([buildPool(size)], 1)) {
        if (s.refTeamId == null) continue;
        expect(s.refTeamId).not.toBe(s.homeTeamId);
        expect(s.refTeamId).not.toBe(s.awayTeamId);
      }
    }
  });

  it("keeps the reffing-crossover rule as the tiebreaker for most matches", () => {
    // Balance is satisfied first, but ties resolve to whoever plays next — so the
    // ref of a match usually plays the very next match. Assert the majority do.
    const ordered = [...layoutPoolSchedule([buildPool(5)], 1)].sort(
      (a, b) => a.slot - b.slot,
    );
    let crossover = 0;
    const eligible = ordered.length - 1;
    for (let k = 0; k < eligible; k++) {
      const next = ordered[k + 1];
      if (
        ordered[k].refTeamId === next.homeTeamId ||
        ordered[k].refTeamId === next.awayTeamId
      ) {
        crossover += 1;
      }
    }
    expect(crossover).toBeGreaterThanOrEqual(Math.ceil(eligible / 2));
  });
});

describe("assignPoolRefs (used by the in-place rebalance)", () => {
  it("balances ≤1 and never self-refs for an arbitrary match order", () => {
    const teamIds = ["A", "B", "C", "D"];
    const matches = [
      { homeTeamId: "A", awayTeamId: "B" },
      { homeTeamId: "C", awayTeamId: "D" },
      { homeTeamId: "A", awayTeamId: "C" },
      { homeTeamId: "B", awayTeamId: "D" },
      { homeTeamId: "A", awayTeamId: "D" },
      { homeTeamId: "B", awayTeamId: "C" },
    ];
    const refs = assignPoolRefs(teamIds, matches);
    expect(refs).toHaveLength(matches.length);
    refs.forEach((r, i) => {
      if (r) {
        expect(r).not.toBe(matches[i].homeTeamId);
        expect(r).not.toBe(matches[i].awayTeamId);
      }
    });
    const counts = new Map(teamIds.map((id) => [id, 0]));
    for (const r of refs) if (r) counts.set(r, counts.get(r)! + 1);
    const vals = [...counts.values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });

  it("returns all nulls for a 2-team pool (no eligible ref)", () => {
    expect(
      assignPoolRefs(["A", "B"], [{ homeTeamId: "A", awayTeamId: "B" }]),
    ).toEqual([null]);
  });
});
