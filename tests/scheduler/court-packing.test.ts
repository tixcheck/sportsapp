import { describe, expect, it } from "vitest";

import {
  packPoolsOntoCourts,
  makespanOf,
  type PoolPlacement,
} from "@/lib/scheduler/court-packing";

/** Reference: the current layout (court = i % courts, stacked in order). */
function legacy(lengths: number[], courts: number): PoolPlacement[] {
  const load = new Array<number>(courts).fill(0);
  return lengths.map((len, i) => {
    const court = i % courts;
    const startSlot = load[court];
    load[court] += len;
    return { court: court + 1, startSlot };
  });
}

/** Each court's pools must occupy disjoint, contiguous slot ranges. */
function assertNoOverlap(placements: PoolPlacement[], lengths: number[]): void {
  const byCourt = new Map<number, { start: number; end: number }[]>();
  placements.forEach((p, i) => {
    const list = byCourt.get(p.court) ?? [];
    list.push({ start: p.startSlot, end: p.startSlot + lengths[i] });
    byCourt.set(p.court, list);
  });
  for (const ranges of byCourt.values()) {
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
    }
  }
}

/** Deterministic LCG so the property test is reproducible (no Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("packPoolsOntoCourts", () => {
  it("gives each pool its own court at slot 0 when courts ≥ pools", () => {
    const out = packPoolsOntoCourts([6, 6], 3);
    expect(out).toEqual([
      { court: 1, startSlot: 0 },
      { court: 2, startSlot: 0 },
    ]);
  });

  it("reproduces the current tie-break for equal pools (3 pools, 2 courts)", () => {
    // Pool C (index 2) shares Court 1 with Pool A → starts at slot 6.
    const out = packPoolsOntoCourts([6, 6, 6], 2);
    expect(out[2]).toEqual({ court: 1, startSlot: 6 });
    expect(makespanOf(out, [6, 6, 6])).toBe(12);
  });

  it("strictly cuts makespan on heterogeneous sizes ([15,6,6] / 2 courts)", () => {
    const lengths = [15, 6, 6];
    const out = packPoolsOntoCourts(lengths, 2);
    expect(makespanOf(out, lengths)).toBe(15);
    expect(makespanOf(legacy(lengths, 2), lengths)).toBe(21);
    assertNoOverlap(out, lengths);
  });

  it("strictly cuts makespan on a mixed field ([6,6,10,15] / 3 courts)", () => {
    const lengths = [6, 6, 10, 15];
    const out = packPoolsOntoCourts(lengths, 3);
    expect(makespanOf(out, lengths)).toBe(15);
    expect(makespanOf(out, lengths)).toBeLessThan(
      makespanOf(legacy(lengths, 3), lengths),
    );
    assertNoOverlap(out, lengths);
  });

  it("is never worse than the current layout (property test)", () => {
    const rand = lcg(20260626);
    for (let t = 0; t < 500; t++) {
      const courts = 1 + Math.floor(rand() * 4); // 1..4
      const poolCount = 1 + Math.floor(rand() * 6); // 1..6
      const lengths = Array.from(
        { length: poolCount },
        () => 1 + Math.floor(rand() * 15),
      );
      const out = packPoolsOntoCourts(lengths, courts);
      expect(makespanOf(out, lengths)).toBeLessThanOrEqual(
        makespanOf(legacy(lengths, courts), lengths),
      );
      assertNoOverlap(out, lengths);
      // Makespan can't beat the perfect-balance lower bound.
      const total = lengths.reduce((a, b) => a + b, 0);
      const longest = Math.max(...lengths);
      expect(makespanOf(out, lengths)).toBeGreaterThanOrEqual(
        Math.max(longest, Math.ceil(total / courts)),
      );
    }
  });

  it("is deterministic", () => {
    expect(packPoolsOntoCourts([6, 6, 10, 15], 3)).toEqual(
      packPoolsOntoCourts([6, 6, 10, 15], 3),
    );
  });

  it("handles the empty field", () => {
    expect(packPoolsOntoCourts([], 4)).toEqual([]);
  });
});
