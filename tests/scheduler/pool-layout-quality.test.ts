import { describe, expect, it } from "vitest";

import {
  assignPoolRefs,
  detectCourtTimeCollisions,
  poolPlan,
  type LayoutPool,
} from "@/lib/scheduler/pools";
import { generatePairings } from "@/lib/scheduler/round-robin";
import {
  orderPoolMatches,
  restGapStats,
  type OrderedMatch,
} from "@/lib/scheduler/pool-ordering";
import { packPoolsOntoCourts } from "@/lib/scheduler/court-packing";

interface Slot {
  poolIndex: number;
  court: number;
  slot: number;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  refTeamId: string | null;
}

function pool(size: number, offset = 0): LayoutPool {
  const teamIds = Array.from({ length: size }, (_, i) => `T${offset + i + 1}`);
  return {
    teamIds,
    rounds: generatePairings(teamIds, poolPlan(size).roundsPerTeam),
  };
}

/** The schedule the refactored layoutPoolSchedule will produce (engine only). */
function smartLayout(pools: LayoutPool[], courts: number): Slot[] {
  const ordered = pools.map((p) => orderPoolMatches(p.teamIds, p.rounds));
  const placements = packPoolsOntoCourts(
    ordered.map((o) => o.length),
    courts,
  );
  const out: Slot[] = [];
  pools.forEach((p, pi) => {
    const seq = ordered[pi];
    const { court, startSlot } = placements[pi];
    const refs = assignPoolRefs(
      p.teamIds,
      seq.map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId })),
    );
    seq.forEach((m, k) =>
      out.push({
        poolIndex: pi,
        court,
        slot: startSlot + k,
        round: m.round,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        refTeamId: refs[k],
      }),
    );
  });
  return out;
}

/** The CURRENT layoutPoolSchedule behavior (flatten + i % courts), for comparison. */
function legacyLayout(pools: LayoutPool[], courts: number): Slot[] {
  const nextSlot = new Array<number>(courts).fill(0);
  const out: Slot[] = [];
  pools.forEach((p, pi) => {
    const court = pi % courts;
    const start = nextSlot[court];
    const seq: OrderedMatch[] = p.rounds.flatMap((r) =>
      r.pairs.map((pr) => ({
        round: r.round,
        homeTeamId: pr.homeTeamId,
        awayTeamId: pr.awayTeamId,
      })),
    );
    const refs = assignPoolRefs(
      p.teamIds,
      seq.map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId })),
    );
    refs.forEach((ref, k) =>
      out.push({
        poolIndex: pi,
        court: court + 1,
        slot: start + k,
        round: seq[k].round,
        homeTeamId: seq[k].homeTeamId,
        awayTeamId: seq[k].awayTeamId,
        refTeamId: ref,
      }),
    );
    nextSlot[court] = start + seq.length;
  });
  return out;
}

function makespan(slots: Slot[]): number {
  return slots.length === 0 ? 0 : Math.max(...slots.map((s) => s.slot)) + 1;
}

function poolVariance(slots: Slot[], pools: LayoutPool[]): number {
  const gaps: number[] = [];
  pools.forEach((p, pi) => {
    const seq = slots
      .filter((s) => s.poolIndex === pi)
      .sort((a, b) => a.slot - b.slot)
      .map((s) => ({
        round: s.round,
        homeTeamId: s.homeTeamId,
        awayTeamId: s.awayTeamId,
      }));
    gaps.push(...restGapStats(seq, p.teamIds).gaps);
  });
  if (gaps.length === 0) return 0;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
}

const SIZES = [3, 4, 5, 6] as const;
const COURTS = [1, 2, 3, 4] as const;

describe("smart pool layout — hard constraints hold", () => {
  for (const size of SIZES) {
    for (const courts of COURTS) {
      it(`${size}-team pools across ${courts} courts: all invariants`, () => {
        const pools = [pool(size, 0), pool(size, size), pool(size, 2 * size)];
        const slots = smartLayout(pools, courts);

        // H: zero court/time collisions.
        expect(detectCourtTimeCollisions(slots)).toEqual([]);

        // H1: no team plays two matches in the same time slot.
        const bySlot = new Map<number, string[]>();
        for (const s of slots) {
          const list = bySlot.get(s.slot) ?? [];
          list.push(s.homeTeamId, s.awayTeamId);
          bySlot.set(s.slot, list);
        }
        for (const players of bySlot.values()) {
          expect(new Set(players).size).toBe(players.length);
        }

        // H2/H4: ref is in-pool, not playing this match, and not playing
        // anything else in the same slot (no play-while-reffing).
        const playersAt = (slot: number) =>
          new Set(
            slots
              .filter((s) => s.slot === slot)
              .flatMap((s) => [s.homeTeamId, s.awayTeamId]),
          );
        for (const s of slots) {
          if (s.refTeamId == null) continue;
          expect(pools[s.poolIndex].teamIds).toContain(s.refTeamId);
          expect(s.refTeamId).not.toBe(s.homeTeamId);
          expect(s.refTeamId).not.toBe(s.awayTeamId);
          expect(playersAt(s.slot).has(s.refTeamId)).toBe(false);
        }

        // H3: ref counts within each pool differ by ≤ 1.
        pools.forEach((p, pi) => {
          const counts = new Map<string, number>(
            p.teamIds.map((id) => [id, 0]),
          );
          for (const s of slots) {
            if (s.poolIndex === pi && s.refTeamId)
              counts.set(s.refTeamId, counts.get(s.refTeamId)! + 1);
          }
          const vals = [...counts.values()];
          // 2-team pools have no eligible ref (all null) → skip the spread check.
          if (p.teamIds.length > 2) {
            expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(
              1,
            );
          }
        });

        // H5: game-count / pool integrity (same multiset of pairings).
        pools.forEach((p, pi) => {
          const got = slots
            .filter((s) => s.poolIndex === pi)
            .map((s) => [s.homeTeamId, s.awayTeamId].sort().join("|"))
            .sort();
          const want = p.rounds
            .flatMap((r) => r.pairs)
            .map((pr) => [pr.homeTeamId, pr.awayTeamId].sort().join("|"))
            .sort();
          expect(got).toEqual(want);
        });
      });
    }
  }
});

describe("smart pool layout — beats the current layout", () => {
  it("cuts makespan on a heterogeneous field (6-team + 4 + 4 / 2 courts)", () => {
    const pools = [pool(6, 0), pool(4, 6), pool(4, 10)];
    expect(makespan(smartLayout(pools, 2))).toBeLessThan(
      makespan(legacyLayout(pools, 2)),
    );
  });

  it("never increases makespan (sizes × courts)", () => {
    for (const size of SIZES) {
      for (const courts of COURTS) {
        const pools = [pool(size, 0), pool(size, size), pool(size, 2 * size)];
        expect(makespan(smartLayout(pools, courts))).toBeLessThanOrEqual(
          makespan(legacyLayout(pools, courts)),
        );
      }
    }
  });

  it("lowers rest-gap variance for a 5-team pool (the real ordering win)", () => {
    const pools = [pool(5, 0)];
    expect(poolVariance(smartLayout(pools, 1), pools)).toBeLessThan(
      poolVariance(legacyLayout(pools, 1), pools),
    );
  });

  it("never raises rest-gap variance (sizes, 1 court)", () => {
    for (const size of SIZES) {
      const pools = [pool(size, 0)];
      expect(poolVariance(smartLayout(pools, 1), pools)).toBeLessThanOrEqual(
        poolVariance(legacyLayout(pools, 1), pools),
      );
    }
  });
});

// WATCH ITEM (per plan): does reordering the 5-team pool regress the reffing
// crossover (ref plays the next match) that ref-balance.test.ts guards at
// ≥ ceil(eligible/2)? Measure smart vs legacy vs the threshold. No silent
// relaxation — if smart < threshold this surfaces it.
describe("5-team reffing crossover under the smart order", () => {
  function crossover(slots: Slot[]): number {
    const ordered = [...slots].sort((a, b) => a.slot - b.slot);
    let n = 0;
    for (let k = 0; k < ordered.length - 1; k++) {
      const next = ordered[k + 1];
      if (
        ordered[k].refTeamId === next.homeTeamId ||
        ordered[k].refTeamId === next.awayTeamId
      )
        n += 1;
    }
    return n;
  }

  it("stays above the crossover floor ref-balance.test.ts guards", () => {
    // Measured: legacy=8, smart=7 of 9 transitions. The reorder costs one
    // crossover but stays well above the ≥ ceil(eligible/2) floor — and buys
    // eliminating both back-to-backs for the 5-team pool.
    const smart = crossover(smartLayout([pool(5, 0)], 1));
    const eligible = 10 - 1; // 5-team single RR = 10 matches
    expect(smart).toBeGreaterThanOrEqual(Math.ceil(eligible / 2));
  });
});
