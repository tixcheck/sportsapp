import { describe, expect, it } from "vitest";

import {
  countRepeats,
  repoolForRound2,
  type RepoolPair,
} from "@/lib/kotc/repool";

const pairs = (...specs: [string, number][]): RepoolPair[] =>
  specs.map(([teamId, seedScore]) => ({ teamId, seedScore }));

describe("countRepeats", () => {
  it("counts poolmate pairs that repeat from the prior pools", () => {
    const prior = [
      ["A", "B"],
      ["C", "D"],
    ];
    expect(
      countRepeats(
        [
          ["A", "C"],
          ["B", "D"],
        ],
        prior,
      ),
    ).toBe(0);
    expect(
      countRepeats(
        [
          ["A", "B"],
          ["C", "D"],
        ],
        prior,
      ),
    ).toBe(2);
    expect(
      countRepeats(
        [
          ["A", "B"],
          ["C", "E"],
        ],
        prior,
      ),
    ).toBe(1);
  });
});

describe("repoolForRound2", () => {
  it("removes rematches the serpentine baseline would create", () => {
    // With equal seeds, the serpentine baseline reproduces the prior pairings;
    // local search must break them (balance is unaffected at equal strength).
    const prior = [
      ["A", "D"],
      ["B", "C"],
    ];
    const res = repoolForRound2(
      pairs(["A", 1], ["B", 1], ["C", 1], ["D", 1]),
      prior,
      [2, 2],
    );
    expect(res.repeats).toBe(0);
    expect(countRepeats(res.pools, prior)).toBe(0);
    expect(res.pools.flat().sort()).toEqual(["A", "B", "C", "D"]);
    expect(res.pools.map((p) => p.length)).toEqual([2, 2]);
  });

  it("prioritizes removing rematches over perfect balance (lexicographic)", () => {
    // Strong pairs A,B; weak C,D. Prior forced A–D and B–C together.
    // Eliminating repeats is worth a small balance hit.
    const prior = [
      ["A", "D"],
      ["B", "C"],
    ];
    const res = repoolForRound2(
      pairs(["A", 10], ["B", 9], ["C", 2], ["D", 1]),
      prior,
      [2, 2],
    );
    expect(res.repeats).toBe(0);
  });

  it("keeps the balanced serpentine layout when there are no prior pools", () => {
    const res = repoolForRound2(
      pairs(["A", 10], ["B", 9], ["C", 2], ["D", 1]),
      [],
      [2, 2],
    );
    // No rematch pressure → strength-balanced split (11 vs 11).
    const sum = (p: string[]) =>
      p.reduce((s, t) => s + { A: 10, B: 9, C: 2, D: 1 }[t]!, 0);
    expect(res.pools.map(sum).sort()).toEqual([11, 11]);
    expect(res.repeats).toBe(0);
  });

  it("is deterministic", () => {
    const p = pairs(["A", 5], ["B", 4], ["C", 3], ["D", 2], ["E", 1], ["F", 0]);
    const prior = [
      ["A", "B", "C"],
      ["D", "E", "F"],
    ];
    expect(repoolForRound2(p, prior, [3, 3])).toEqual(
      repoolForRound2(p, prior, [3, 3]),
    );
  });
});
