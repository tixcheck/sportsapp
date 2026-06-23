import { describe, expect, it } from "vitest";

import { poolSizesForGames, gamesPerTeamRange } from "@/lib/scheduler/pools";

describe("poolSizesForGames", () => {
  it("hits the target exactly when teams divide evenly", () => {
    expect(poolSizesForGames(12, 5)).toEqual([6, 6]); // 5 games each
    expect(poolSizesForGames(12, 3)).toEqual([4, 4, 4]); // 3 games each
    expect(poolSizesForGames(8, 3)).toEqual([4, 4]); // 3 games each
  });

  it("always sums to the team count", () => {
    for (let n = 3; n <= 40; n++) {
      for (const g of [2, 3, 4, 5, 6]) {
        expect(poolSizesForGames(n, g).reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });

  it("keeps pool sizes within 1 of each other (even split)", () => {
    for (let n = 3; n <= 40; n++) {
      for (const g of [3, 4, 5]) {
        const sizes = poolSizesForGames(n, g);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("lands games-per-team close to the target", () => {
    // 16 teams, target 5 → 6/5/5 → most play 5, some 4.
    const sizes = poolSizesForGames(16, 5);
    expect(sizes).toEqual([6, 5, 5]);
    const { min, max } = gamesPerTeamRange(sizes);
    expect(max).toBe(5);
    expect(min).toBe(4);
  });

  it("never makes a 1-team pool for n >= 3", () => {
    for (let n = 3; n <= 40; n++) {
      for (const g of [2, 3, 4, 5, 6, 8]) {
        expect(poolSizesForGames(n, g).every((s) => s >= 2)).toBe(true);
      }
    }
  });

  it("puts everyone in one pool when the field is smaller than the ideal", () => {
    // target 5 ⇒ ideal pool size 6; only 5 teams → one pool, 4 games each.
    expect(poolSizesForGames(5, 5)).toEqual([5]);
    expect(gamesPerTeamRange(poolSizesForGames(5, 5))).toEqual({
      min: 4,
      max: 4,
    });
  });

  it("handles degenerate counts", () => {
    expect(poolSizesForGames(0, 3)).toEqual([]);
    expect(poolSizesForGames(2, 3)).toEqual([2]);
  });
});
