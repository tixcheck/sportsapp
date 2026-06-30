import { describe, expect, it } from "vitest";

import {
  compareKotcResults,
  rankKotcPool,
  type KotcPoolResult,
} from "@/lib/kotc/ranking";

const r = (
  teamId: string,
  kingPoints: number,
  longestStreak: number | null = null,
  reachedSeq: number | null = null,
): KotcPoolResult => ({ teamId, kingPoints, longestStreak, reachedSeq });

describe("compareKotcResults — the 3-level hierarchy", () => {
  it("level 1: more King points ranks higher", () => {
    const { cmp, step } = compareKotcResults(r("A", 10), r("B", 8));
    expect(cmp).toBeLessThan(0); // A first
    expect(step).toBe(1);
  });

  it("level 2: equal points → longer streak ranks higher", () => {
    const { cmp, step } = compareKotcResults(r("A", 8, 3), r("B", 8, 5));
    expect(cmp).toBeGreaterThan(0); // B first (longer streak)
    expect(step).toBe(2);
  });

  it("level 3: equal points & streak → reached the total earlier ranks higher", () => {
    const { cmp, step } = compareKotcResults(
      r("A", 8, 4, 20),
      r("B", 8, 4, 25),
    );
    expect(cmp).toBeLessThan(0); // A reached 8 first (seq 20 < 25)
    expect(step).toBe(3);
  });

  it("level 4: equal on every computable level → TBD", () => {
    expect(compareKotcResults(r("A", 8, 4, 20), r("B", 8, 4, 20)).step).toBe(4);
  });

  it("skips levels whose data is missing (manual entry)", () => {
    // No streak/seq data → equal points falls straight through to TBD.
    expect(compareKotcResults(r("A", 8), r("B", 8)).step).toBe(4);
    // Streak known but seq missing → resolves on streak, not seq.
    expect(compareKotcResults(r("A", 8, 5), r("B", 8, 3)).step).toBe(2);
  });

  it("skips a level when only ONE side has the data", () => {
    // A has a streak, B doesn't → can't compare streak; both lack seq → TBD.
    expect(compareKotcResults(r("A", 8, 5), r("B", 8)).step).toBe(4);
    // Equal streak; A has a seq, B doesn't → can't compare reached-first → TBD.
    expect(compareKotcResults(r("A", 8, 4, 10), r("B", 8, 4)).step).toBe(4);
  });
});

describe("rankKotcPool", () => {
  it("orders by points, then streak, then reached-first", () => {
    const rows = rankKotcPool([
      r("C", 8, 4, 25),
      r("A", 10, 2, 30),
      r("B", 8, 4, 20),
    ]);
    expect(rows.map((x) => x.teamId)).toEqual(["A", "B", "C"]);
    expect(rows.map((x) => x.position)).toEqual([1, 2, 3]);
    // B over C decided at level 3 (reached 8 first).
    expect(rows[2].tiebreakStep).toBe(3);
  });

  it("produces a deterministic total order even for full ties (TBD)", () => {
    const rows = rankKotcPool([r("X", 5), r("Y", 5), r("Z", 5)]);
    expect(rows.map((x) => x.teamId)).toEqual(["X", "Y", "Z"]); // stable input order
    expect(rows.every((x) => x.tiebreakStep === 4)).toBe(true);
  });

  it("is deterministic", () => {
    const input = [r("B", 8, 4, 20), r("A", 8, 4, 20), r("C", 9)];
    expect(rankKotcPool(input)).toEqual(rankKotcPool(input));
  });

  it("carries an explanation per row", () => {
    const rows = rankKotcPool([r("A", 10), r("B", 8)]);
    expect(rows[0].explanation).toContain("10");
    expect(rows[1].explanation).toContain("8");
  });

  it("ranks a single pair (no neighbor)", () => {
    const rows = rankKotcPool([r("A", 5)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe(1);
    expect(rows[0].tiebreakStep).toBe(1);
  });
});
