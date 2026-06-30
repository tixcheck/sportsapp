import { describe, expect, it } from "vitest";

import {
  composeFinals,
  dropLowest,
  eliminationComplete,
  eliminationRoundsNeeded,
  gatherConsolation,
} from "@/lib/kotc/elimination";
import type { KotcPoolResult } from "@/lib/kotc/ranking";

const r = (
  teamId: string,
  kingPoints: number,
  longestStreak: number | null = null,
  reachedSeq: number | null = null,
): KotcPoolResult => ({ teamId, kingPoints, longestStreak, reachedSeq });

describe("eliminationRoundsNeeded", () => {
  it("is max(0, size - 3)", () => {
    expect(eliminationRoundsNeeded(8)).toBe(5); // 8→7→6→5→4→3
    expect(eliminationRoundsNeeded(4)).toBe(1); // 4→3
    expect(eliminationRoundsNeeded(3)).toBe(0); // already done
    expect(eliminationRoundsNeeded(2)).toBe(0); // never goes below the field
    expect(eliminationRoundsNeeded(7)).toBe(4);
  });
});

describe("eliminationComplete", () => {
  it("stops at 3 or fewer", () => {
    expect(eliminationComplete(4)).toBe(false);
    expect(eliminationComplete(3)).toBe(true);
    expect(eliminationComplete(2)).toBe(true);
  });
});

describe("dropLowest", () => {
  it("drops the last-ranked pair and returns the rest in order", () => {
    const { dropped, remaining, tied } = dropLowest([
      r("A", 10),
      r("B", 7),
      r("C", 3),
    ]);
    expect(dropped).toBe("C");
    expect(remaining).toEqual(["A", "B"]);
    expect(tied).toBe(false);
  });

  it("resolves a tie-for-lowest via the tiebreaker (shorter streak drops)", () => {
    // B and C equal on points; C has the shorter streak → C is the lowest.
    const { dropped, tied } = dropLowest([
      r("A", 10),
      r("B", 5, 3),
      r("C", 5, 1),
    ]);
    expect(dropped).toBe("C");
    expect(tied).toBe(false); // resolved at the streak level
  });

  it("flags a TRUE tie for lowest (manual entry, no streak/seq) as `tied`", () => {
    // B and C: equal points, no streak/seq data → genuinely tied for last.
    const { dropped, tied } = dropLowest([r("A", 10), r("B", 5), r("C", 5)]);
    expect(tied).toBe(true);
    expect(["B", "C"]).toContain(dropped); // one of the tied pair; caller must confirm
  });

  it("throws on an empty field", () => {
    expect(() => dropLowest([])).toThrow();
  });
});

describe("the drop loop (shared by elimination pools AND finals)", () => {
  it("takes eliminationRoundsNeeded(N) rounds and ends with exactly 3", () => {
    let remaining = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
    const eliminated: string[] = [];
    let rounds = 0;
    while (!eliminationComplete(remaining.length)) {
      // Synthetic round: distinct points so the lowest is unambiguous.
      const results = remaining.map((t, i) => r(t, remaining.length - i));
      const step = dropLowest(results);
      eliminated.push(step.dropped);
      remaining = step.remaining;
      rounds += 1;
    }
    expect(rounds).toBe(eliminationRoundsNeeded(8)); // 5
    expect(remaining).toHaveLength(3);
    expect(eliminated).toHaveLength(5);
    // The final 3 (highest synthetic points) are the survivors / podium.
    expect(remaining).toEqual(["P1", "P2", "P3"]);
  });

  it("plays zero rounds when the field is already ≤ 3", () => {
    const remaining = ["A", "B", "C"];
    expect(eliminationComplete(remaining.length)).toBe(true);
  });
});

describe("gatherConsolation", () => {
  it("flattens every dropped pair across pools", () => {
    expect(
      gatherConsolation([{ eliminated: ["A8", "A7"] }, { eliminated: ["B8"] }]),
    ).toEqual(["A8", "A7", "B8"]);
  });

  it("is empty when no one was eliminated (all pools ≤3)", () => {
    expect(gatherConsolation([{ eliminated: [] }, { eliminated: [] }])).toEqual(
      [],
    );
  });
});

describe("composeFinals", () => {
  it("combines each pool's trio plus the consolation winner", () => {
    expect(
      composeFinals(
        [
          ["A1", "A2", "A3"],
          ["B1", "B2", "B3"],
        ],
        "C1",
      ),
    ).toEqual(["A1", "A2", "A3", "B1", "B2", "B3", "C1"]);
  });

  it("omits the consolation slot when there was no consolation winner", () => {
    expect(composeFinals([["A1", "A2", "A3"]], null)).toEqual([
      "A1",
      "A2",
      "A3",
    ]);
  });
});
