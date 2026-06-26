import { describe, expect, it } from "vitest";

import {
  orderPoolMatches,
  orderCost,
  restGapStats,
  type OrderedMatch,
} from "@/lib/scheduler/pool-ordering";
import { poolPlan } from "@/lib/scheduler/pools";
import { generatePairings } from "@/lib/scheduler/round-robin";

const SIZES = [3, 4, 5, 6] as const;

function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

function baselineFor(n: number): OrderedMatch[] {
  const ids = teams(n);
  return generatePairings(ids, poolPlan(n).roundsPerTeam).flatMap((r) =>
    r.pairs.map((p) => ({
      round: r.round,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
    })),
  );
}

function key(m: OrderedMatch): string {
  return `${m.homeTeamId}|${m.awayTeamId}`;
}

describe("restGapStats", () => {
  it("measures per-team between-games gaps and back-to-backs", () => {
    const order: OrderedMatch[] = [
      { round: 1, homeTeamId: "A", awayTeamId: "B" }, // slot 0
      { round: 1, homeTeamId: "A", awayTeamId: "C" }, // slot 1  → A back-to-back
      { round: 1, homeTeamId: "B", awayTeamId: "C" }, // slot 2  → C back-to-back
    ];
    const s = restGapStats(order, ["A", "B", "C"]);
    // A:[0,1]→gap1, B:[0,2]→gap2, C:[1,2]→gap1
    expect(s.gaps.slice().sort()).toEqual([1, 1, 2]);
    expect(s.backToBacks).toBe(2);
    expect(s.maxGap).toBe(2);
    expect(s.minGap).toBe(1);
  });

  it("excludes leading/trailing idle (a gap is between two of a team's games)", () => {
    const order: OrderedMatch[] = [
      { round: 1, homeTeamId: "A", awayTeamId: "B" }, // slot 0
      { round: 1, homeTeamId: "C", awayTeamId: "D" }, // slot 1
      { round: 1, homeTeamId: "A", awayTeamId: "C" }, // slot 2
    ];
    // A:[0,2]→gap2, B:[0] none, C:[1,2]→gap1, D:[1] none
    const s = restGapStats(order, ["A", "B", "C", "D"]);
    expect(s.gaps.slice().sort()).toEqual([1, 2]);
  });

  it("is empty/zero for a single-game pool", () => {
    const s = restGapStats(
      [{ round: 1, homeTeamId: "A", awayTeamId: "B" }],
      ["A", "B"],
    );
    expect(s).toEqual({
      gaps: [],
      variance: 0,
      backToBacks: 0,
      maxGap: 0,
      minGap: 0,
    });
  });
});

describe("orderCost", () => {
  it("weights a back-to-back far above variance", () => {
    const withB2B: OrderedMatch[] = [
      { round: 1, homeTeamId: "A", awayTeamId: "B" },
      { round: 1, homeTeamId: "A", awayTeamId: "C" },
      { round: 1, homeTeamId: "B", awayTeamId: "C" },
    ];
    // one back-to-back alone costs ≥ 100
    expect(orderCost(withB2B, ["A", "B", "C"])).toBeGreaterThanOrEqual(100);
  });
});

describe("orderPoolMatches", () => {
  for (const n of SIZES) {
    it(`${n}-team: keeps the exact games and home/away (a permutation)`, () => {
      const base = baselineFor(n);
      const out = orderPoolMatches(teams(n), buildRounds(n));
      expect(out).toHaveLength(base.length);
      expect(out.map(key).sort()).toEqual(base.map(key).sort());
    });

    it(`${n}-team: never worse than the round-order baseline`, () => {
      const base = baselineFor(n);
      const out = orderPoolMatches(teams(n), buildRounds(n));
      expect(orderCost(out, teams(n))).toBeLessThanOrEqual(
        orderCost(base, teams(n)),
      );
    });

    it(`${n}-team: deterministic`, () => {
      const a = orderPoolMatches(teams(n), buildRounds(n));
      const b = orderPoolMatches(teams(n), buildRounds(n));
      expect(a).toEqual(b);
    });
  }

  it("strictly improves a baseline with avoidable back-to-backs (5-team)", () => {
    // 5-team is the real win: the round-order baseline has 2 back-to-backs; the
    // smart order removes both and lowers variance.
    const base = baselineFor(5);
    const out = orderPoolMatches(teams(5), buildRounds(5));
    expect(restGapStats(out, teams(5)).backToBacks).toBeLessThan(
      restGapStats(base, teams(5)).backToBacks,
    );
    expect(orderCost(out, teams(5))).toBeLessThan(orderCost(base, teams(5)));
  });

  it("ties the already-optimal baseline for 3- and 4-team pools", () => {
    // 3-team (double RR) and 4-team round-order are already cost-optimal — the
    // optimizer must match, not beat, them (consistent with HANDOFF).
    for (const n of [3, 4] as const) {
      expect(
        orderCost(orderPoolMatches(teams(n), buildRounds(n)), teams(n)),
      ).toBe(orderCost(baselineFor(n), teams(n)));
    }
  });

  it("4-team matches the validated reference order's fairness", () => {
    // Reference: 1v3, 2v4, 1v4, 2v3, 3v4, 1v2 (even rest, minimal back-to-backs).
    const reference: OrderedMatch[] = [
      { round: 0, homeTeamId: "T1", awayTeamId: "T3" },
      { round: 0, homeTeamId: "T2", awayTeamId: "T4" },
      { round: 0, homeTeamId: "T1", awayTeamId: "T4" },
      { round: 0, homeTeamId: "T2", awayTeamId: "T3" },
      { round: 0, homeTeamId: "T3", awayTeamId: "T4" },
      { round: 0, homeTeamId: "T1", awayTeamId: "T2" },
    ];
    const out = orderPoolMatches(teams(4), buildRounds(4));
    // Brute-forced optimum ⇒ no worse than the reference on either measure.
    expect(orderCost(out, teams(4))).toBeLessThanOrEqual(
      orderCost(reference, teams(4)),
    );
    expect(restGapStats(out, teams(4)).backToBacks).toBeLessThanOrEqual(
      restGapStats(reference, teams(4)).backToBacks,
    );
  });
});

/** Build a pool's pairing rounds the same way generatePoolsAction does. */
function buildRounds(n: number) {
  return generatePairings(teams(n), poolPlan(n).roundsPerTeam);
}
