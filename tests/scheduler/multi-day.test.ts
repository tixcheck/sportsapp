import { describe, expect, it } from "vitest";

import {
  layoutMultiDaySchedule,
  type DivisionLayoutInput,
  type MultiDayMatch,
} from "@/lib/scheduler/multi-day";
import { generatePairings } from "@/lib/scheduler/round-robin";
import type { LayoutPool } from "@/lib/scheduler/pools";

function teams(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

/** One single-round-robin pool. */
function pool(teamIds: string[]): LayoutPool {
  return { teamIds, rounds: generatePairings(teamIds, 1) };
}

function division(
  id: string,
  n: number,
  courts: number[] | null,
): DivisionLayoutInput {
  return { divisionId: id, pools: [pool(teams(id, n))], courts };
}

/** (day, court, slot) triples used more than once. */
function collisions(matches: MultiDayMatch[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const m of matches) {
    const k = `${m.day}:${m.court}:${m.slot}`;
    if (seen.has(k)) dupes.push(k);
    else seen.add(k);
  }
  return dupes;
}

describe("layoutMultiDaySchedule", () => {
  it("runs divisions in parallel on their own courts with no collision", () => {
    const out = layoutMultiDaySchedule(
      [division("A", 4, [1, 2]), division("B", 4, [3, 4])],
      4,
      [3], // single day, 4-team RR = 3 games each
    );
    expect(collisions(out)).toEqual([]);
    expect(
      out.filter((m) => m.divisionId === "A").every((m) => m.court <= 2),
    ).toBe(true);
    expect(
      out.filter((m) => m.divisionId === "B").every((m) => m.court >= 3),
    ).toBe(true);
    expect(out).toHaveLength(12); // 6 games per division
    expect(out.every((m) => m.day === 0)).toBe(true);
  });

  it("keeps divisions sharing a court pool blocked (one finishes before the next)", () => {
    const out = layoutMultiDaySchedule(
      [division("A", 4, null), division("B", 4, null)],
      2, // both share courts 1-2
      [3],
    );
    expect(collisions(out)).toEqual([]);
    const aSlots = out.filter((m) => m.divisionId === "A").map((m) => m.slot);
    const bSlots = out.filter((m) => m.divisionId === "B").map((m) => m.slot);
    // A's whole block precedes B's — blocked, not interleaved.
    expect(Math.max(...aSlots)).toBeLessThan(Math.min(...bSlots));
    expect(out.every((m) => m.court <= 2)).toBe(true);
  });

  it("splits a division's games across days by the per-team target", () => {
    const out = layoutMultiDaySchedule([division("A", 6, [1, 2])], 2, [3, 2]);
    expect(collisions(out)).toEqual([]);
    expect(out.every((m) => m.day === 0 || m.day === 1)).toBe(true);
    // Each team plays at most 3 on day 0 (6-team RR = 5 games each).
    const day0 = new Map<string, number>();
    for (const m of out.filter((x) => x.day === 0)) {
      for (const id of [m.homeTeamId, m.awayTeamId]) {
        day0.set(id, (day0.get(id) ?? 0) + 1);
      }
    }
    for (const c of day0.values()) expect(c).toBeLessThanOrEqual(3);
    expect(out).toHaveLength(15); // C(6,2)
  });

  it("gives an explicit-court division and a shared-pool one disjoint courts", () => {
    // A claims 1-2; B (shared) gets the leftover 3-4.
    const out = layoutMultiDaySchedule(
      [division("A", 4, [1, 2]), division("B", 4, null)],
      4,
      [3],
    );
    expect(collisions(out)).toEqual([]);
    expect(
      out.filter((m) => m.divisionId === "B").every((m) => m.court >= 3),
    ).toBe(true);
  });

  it("blocks each day independently when shared divisions span multiple days", () => {
    const out = layoutMultiDaySchedule(
      [division("A", 6, null), division("B", 6, null)],
      2,
      [3, 2],
    );
    expect(collisions(out)).toEqual([]);
    for (const day of [0, 1]) {
      const a = out
        .filter((m) => m.divisionId === "A" && m.day === day)
        .map((m) => m.slot);
      const b = out
        .filter((m) => m.divisionId === "B" && m.day === day)
        .map((m) => m.slot);
      if (a.length && b.length)
        expect(Math.max(...a)).toBeLessThan(Math.min(...b));
    }
  });

  it("reduces to a plain single-division single-day layout", () => {
    const out = layoutMultiDaySchedule([division("A", 4, null)], 2, [3]);
    expect(collisions(out)).toEqual([]);
    expect(out).toHaveLength(6);
    expect(out.every((m) => m.day === 0 && m.court <= 2)).toBe(true);
  });

  // Summer Forever: giving each division its own courts routes the event
  // through this function, and it used to ignore the no-referee setting
  // entirely — so a regenerate rebuilt a no-ref event WITH refs, one pool per
  // court, dropping it from 8 nets to 6 and undoing the organizer's re-time.
  describe("with nobody refereeing", () => {
    const noRefs = { refs: false as const };

    it("assigns no referee", () => {
      const out = layoutMultiDaySchedule(
        [division("A", 4, [1, 2]), division("B", 4, [3, 4])],
        4,
        [3],
        noRefs,
      );
      expect(out.every((m) => m.refTeamId === null)).toBe(true);
    });

    // The one that matters. Wave packing leaves a court idle in a wave BECAUSE
    // those teams are playing elsewhere in it, so the gaps carry meaning.
    // Renumbering each court's games to 0,1,2… closed those gaps and slid a
    // team's games on top of one another — a schedule that looked fine and
    // double-booked people.
    it("never puts a team in two places at once", () => {
      const out = layoutMultiDaySchedule(
        [division("A", 4, [1, 2]), division("B", 4, [3, 4])],
        4,
        [3],
        noRefs,
      );
      const seen = new Map<string, string[]>();
      for (const m of out) {
        for (const id of [m.homeTeamId, m.awayTeamId]) {
          const key = `${id}:${m.day}:${m.slot}`;
          seen.set(key, [...(seen.get(key) ?? []), m.divisionId]);
        }
      }
      for (const [key, hits] of seen) {
        expect(hits.length, `${key} appears ${hits.length} times`).toBe(1);
      }
    });

    it("still never double-books a court", () => {
      const out = layoutMultiDaySchedule(
        [division("A", 4, [1, 2]), division("B", 4, [3, 4])],
        4,
        [3],
        noRefs,
      );
      expect(collisions(out)).toEqual([]);
    });

    it("keeps each division on its own courts", () => {
      const out = layoutMultiDaySchedule(
        [division("A", 4, [1, 3]), division("B", 4, [2, 4])],
        4,
        [3],
        noRefs,
      );
      const courtsOf = (id: string) =>
        [
          ...new Set(
            out.filter((m) => m.divisionId === id).map((m) => m.court),
          ),
        ].sort();
      expect(courtsOf("A")).toEqual([1, 3]);
      expect(courtsOf("B")).toEqual([2, 4]);
    });

    // Divisions sharing courts must still be sequenced, not interleaved —
    // preserving waves must not break the blocking rule.
    it("still blocks divisions that share a court pool", () => {
      const out = layoutMultiDaySchedule(
        [division("A", 4, null), division("B", 4, null)],
        2,
        [3],
        noRefs,
      );
      expect(collisions(out)).toEqual([]);
      const aSlots = out.filter((m) => m.divisionId === "A").map((m) => m.slot);
      const bSlots = out.filter((m) => m.divisionId === "B").map((m) => m.slot);
      expect(Math.max(...aSlots)).toBeLessThan(Math.min(...bSlots));
    });

    it("packs a pool onto more than one court, which is the whole point", () => {
      // A 4-team pool has two team-disjoint games, so with 2 courts it should
      // run them side by side rather than one after the other.
      const out = layoutMultiDaySchedule(
        [division("A", 4, [1, 2])],
        2,
        [3],
        noRefs,
      );
      const waves = new Set(out.map((m) => m.slot));
      expect(out).toHaveLength(6);
      expect(waves.size).toBe(3); // 6 games, 2 at a time
    });

    it("leaves the reffed layout exactly as it was", () => {
      const withRefs = layoutMultiDaySchedule(
        [division("A", 4, [1, 2]), division("B", 4, [3, 4])],
        4,
        [3],
      );
      const explicit = layoutMultiDaySchedule(
        [division("A", 4, [1, 2]), division("B", 4, [3, 4])],
        4,
        [3],
        { refs: true },
      );
      expect(explicit).toEqual(withRefs);
    });
  });
});
