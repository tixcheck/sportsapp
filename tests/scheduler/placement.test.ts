import { describe, expect, it } from "vitest";

import {
  addPlacementPool,
  movePlacement,
  placementFromPools,
  removePlacementPool,
  type Placement,
} from "@/lib/scheduler/placement";

const base = (): Placement =>
  placementFromPools([
    ["A", "B"],
    ["C", "D"],
  ]);

describe("placementFromPools", () => {
  it("copies pools and starts with an empty bin", () => {
    const p = placementFromPools([["A"], ["B"]]);
    expect(p).toEqual({ pools: [["A"], ["B"]], unassigned: [] });
  });

  it("does not alias the input arrays", () => {
    const input = [["A"]];
    const p = placementFromPools(input);
    input[0].push("X");
    expect(p.pools[0]).toEqual(["A"]);
  });
});

describe("movePlacement", () => {
  it("moves a team between pools", () => {
    const p = movePlacement(base(), "A", 1);
    expect(p.pools[0]).toEqual(["B"]);
    expect(p.pools[1]).toEqual(["C", "D", "A"]);
  });

  it("moves a team to the unassigned bin", () => {
    const p = movePlacement(base(), "C", "unassigned");
    expect(p.pools[1]).toEqual(["D"]);
    expect(p.unassigned).toEqual(["C"]);
  });

  it("moves a team from unassigned into a pool", () => {
    const start: Placement = { pools: [["A"]], unassigned: ["Z"] };
    const p = movePlacement(start, "Z", 0);
    expect(p.pools[0]).toEqual(["A", "Z"]);
    expect(p.unassigned).toEqual([]);
  });

  it("never duplicates a team (moving within the same pool is idempotent-ish)", () => {
    const p = movePlacement(base(), "A", 0);
    expect(p.pools[0]).toEqual(["B", "A"]);
    const all = [...p.pools.flat(), ...p.unassigned];
    expect(all.filter((id) => id === "A")).toHaveLength(1);
  });

  it("keeps every team present after a move (sizes stay consistent)", () => {
    const p = movePlacement(base(), "B", 1);
    expect([...p.pools.flat(), ...p.unassigned].sort()).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(p.pools.map((x) => x.length)).toEqual([1, 3]);
  });

  it("is a no-op for an out-of-range pool index", () => {
    const start = base();
    expect(movePlacement(start, "A", 5)).toBe(start);
  });
});

describe("addPlacementPool / removePlacementPool", () => {
  it("adds an empty pool", () => {
    const p = addPlacementPool(base());
    expect(p.pools).toHaveLength(3);
    expect(p.pools[2]).toEqual([]);
  });

  it("removing a pool returns its teams to the bin", () => {
    const p = removePlacementPool(base(), 0);
    expect(p.pools).toEqual([["C", "D"]]);
    expect(p.unassigned).toEqual(["A", "B"]);
  });

  it("removing an out-of-range index is a no-op", () => {
    const start = base();
    expect(removePlacementPool(start, 9)).toBe(start);
  });
});
