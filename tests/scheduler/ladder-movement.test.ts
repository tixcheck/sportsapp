import { describe, expect, it } from "vitest";

import {
  applyLadderMovement,
  checkLadderConfig,
  resolveSwaps,
  type LadderTier,
} from "@/lib/scheduler/ladder-movement";

/** Tier of `n` teams, ids like "A1".."A5" — A1 finished top tonight. */
function tier(divisionId: string, n: number): LadderTier {
  return {
    divisionId,
    rankedTeamIds: Array.from({ length: n }, (_, i) => `${divisionId}${i + 1}`),
  };
}

const sizes = (r: { tiers: { teamIds: string[] }[] }) =>
  r.tiers.map((t) => t.teamIds.length);

describe("applyLadderMovement", () => {
  // The owner's example: Tier 1/2/3 at 5/6/5, one team across the 1-2
  // boundary and two across the 2-3 boundary.
  const start = () => [tier("A", 5), tier("B", 6), tier("C", 5)];

  it("keeps uneven tier sizes exactly as they were", () => {
    const res = applyLadderMovement(start(), { swaps: [1, 2] });
    expect(sizes(res)).toEqual([5, 6, 5]);
    expect(res.adjusted).toEqual([]);
  });

  it("swaps the same number both ways at every boundary", () => {
    const res = applyLadderMovement(start(), { swaps: [1, 2] });
    const across = (from: string, dir: "up" | "down") =>
      res.moves.filter((m) => m.fromDivisionId === from && m.direction === dir)
        .length;

    // Boundary A-B: 1 each way. Boundary B-C: 2 each way.
    expect(across("A", "down")).toBe(1);
    expect(across("B", "up")).toBe(1);
    expect(across("B", "down")).toBe(2);
    expect(across("C", "up")).toBe(2);
  });

  it("a tier's own up and down counts may differ", () => {
    // Tier B sends 1 up but 2 down — allowed, because each BOUNDARY balances.
    const res = applyLadderMovement(start(), { swaps: [1, 2] });
    const b = res.moves.filter((m) => m.fromDivisionId === "B");
    expect(b.filter((m) => m.direction === "up")).toHaveLength(1);
    expect(b.filter((m) => m.direction === "down")).toHaveLength(2);
    expect(sizes(res)).toEqual([5, 6, 5]);
  });

  it("moves the right teams — bottom drops, top rises", () => {
    const res = applyLadderMovement(start(), { swaps: [1, 2] });
    expect(res.moves).toContainEqual({
      teamId: "A5",
      fromDivisionId: "A",
      toDivisionId: "B",
      direction: "down",
    });
    expect(res.moves).toContainEqual({
      teamId: "B1",
      fromDivisionId: "B",
      toDivisionId: "A",
      direction: "up",
    });
    // Bottom TWO of B drop to C; top TWO of C rise.
    expect(res.moves).toContainEqual({
      teamId: "B6",
      fromDivisionId: "B",
      toDivisionId: "C",
      direction: "down",
    });
    expect(res.moves).toContainEqual({
      teamId: "C2",
      fromDivisionId: "C",
      toDivisionId: "B",
      direction: "up",
    });
  });

  it("seats a demoted team above the tier it joins, a promoted one below", () => {
    const res = applyLadderMovement(start(), { swaps: [1, 2] });
    const b = res.tiers.find((t) => t.divisionId === "B")!.teamIds;
    expect(b[0]).toBe("A5");
    expect(b.slice(-2)).toEqual(["C1", "C2"]);
  });

  it("holds sizes constant week after week, whatever the counts", () => {
    let tiers = start();
    for (let week = 0; week < 20; week++) {
      const res = applyLadderMovement(tiers, { swaps: [1, 2] });
      expect(sizes(res)).toEqual([5, 6, 5]);
      tiers = res.tiers.map((t) => ({
        divisionId: t.divisionId,
        rankedTeamIds: t.teamIds,
      }));
    }
  });

  it("keeps sizes constant across a sweep of tier shapes and counts", () => {
    for (const shape of [
      [5, 6, 5],
      [4, 4, 4, 4],
      [8, 3],
      [2, 2, 2],
      [6, 5, 4, 3],
    ]) {
      for (const n of [1, 2, 3]) {
        const tiers = shape.map((size, i) => tier(`T${i}`, size));
        const res = applyLadderMovement(tiers, {
          swaps: Array(shape.length - 1).fill(n),
        });
        expect(sizes(res)).toEqual(shape);
      }
    }
  });

  it("keeps every team somewhere, and only once", () => {
    const tiers = start();
    const all = tiers.flatMap((t) => t.rankedTeamIds).sort();
    const res = applyLadderMovement(tiers, { swaps: [1, 2] });
    expect(res.tiers.flatMap((t) => t.teamIds).sort()).toEqual(all);
  });

  it("trims BOTH sides when a tier can't supply its boundaries", () => {
    // Tier B has 3 teams but is asked for 2 up and 2 down. Trimming only B
    // would unbalance a boundary and start the sizes drifting.
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 3), tier("C", 5)],
      { swaps: [2, 2] },
    );
    expect(sizes(res)).toEqual([5, 3, 5]);
    expect(res.adjusted.length).toBeGreaterThan(0);
    expect(res.adjusted[0].limitedByDivisionId).toBe("B");
    // Whatever was applied, B never sends more teams than it has.
    expect(
      res.moves.filter((m) => m.fromDivisionId === "B").length,
    ).toBeLessThanOrEqual(3);
  });

  it("no team is both promoted and relegated in the same night", () => {
    const res = applyLadderMovement(
      [tier("A", 4), tier("B", 4), tier("C", 4)],
      { swaps: [2, 2] },
    );
    const movers = res.moves.map((m) => m.teamId);
    expect(new Set(movers).size).toBe(movers.length);
  });

  it("does nothing when the counts are zero", () => {
    const res = applyLadderMovement(start(), { swaps: [0, 0] });
    expect(res.moves).toEqual([]);
    expect(sizes(res)).toEqual([5, 6, 5]);
  });

  it("handles a single tier as a no-op ladder", () => {
    const res = applyLadderMovement([tier("A", 6)], { swaps: [] });
    expect(res.moves).toEqual([]);
    expect(sizes(res)).toEqual([6]);
  });
});

describe("resolveSwaps", () => {
  it("leaves a feasible config untouched", () => {
    expect(resolveSwaps([5, 6, 5], [1, 2]).swaps).toEqual([1, 2]);
    expect(resolveSwaps([5, 6, 5], [1, 2]).adjusted).toEqual([]);
  });

  it("reduces until every tier can field its movers", () => {
    const { swaps } = resolveSwaps([5, 3, 5], [2, 2]);
    // B commits swaps[0] up + swaps[1] down, and only has 3 teams.
    expect(swaps[0] + swaps[1]).toBeLessThanOrEqual(3);
  });

  it("never returns a negative or fractional count", () => {
    const { swaps } = resolveSwaps([4, 4], [-3]);
    expect(swaps).toEqual([0]);
    expect(resolveSwaps([4, 4], [1.7]).swaps).toEqual([1]);
  });

  it("caps at what the smallest tier can field", () => {
    // Two one-team tiers CAN still trade their single teams — sizes hold at
    // 1 and 1. Whether a 1-team tier can play at all is a separate check.
    expect(resolveSwaps([1, 1], [3]).swaps).toEqual([1]);
    expect(resolveSwaps([4, 2, 4], [3, 3]).swaps[0]).toBeLessThanOrEqual(2);
  });
});

describe("checkLadderConfig", () => {
  it("passes a config every tier can supply", () => {
    const res = checkLadderConfig([5, 6, 5], [1, 2]);
    expect(res.feasible).toBe(true);
    expect(res.resolvedSwaps).toEqual([1, 2]);
    expect(res.tooSmall).toEqual([]);
  });

  it("flags a config that has to be trimmed", () => {
    const res = checkLadderConfig([5, 3, 5], [2, 2]);
    expect(res.feasible).toBe(false);
  });

  it("flags a tier too small to play at all", () => {
    // Sizes never change, so this is a setup problem, not a weekly one.
    expect(checkLadderConfig([5, 1, 5], [0, 0]).tooSmall).toEqual([1]);
  });
});
