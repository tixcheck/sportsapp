import { describe, expect, it } from "vitest";

import type { MatchFormat } from "@/lib/db/schema";
import {
  allSetsDoubleDefaulted,
  defaultProblem,
  defaultedSetScore,
  describeDefaults,
} from "@/lib/scoring/defaults";
import { validateScore } from "@/lib/scoring/validation";

// BVL: a fixed 2-set game to 25.
const BVL: MatchFormat = { bestOf: 2, setsToPoints: [25, 25], winBy: 1 };
const BO3: MatchFormat = { bestOf: 3, setsToPoints: [25, 25, 15], winBy: 2 };

describe("defaultedSetScore", () => {
  it("gives the set's target to the side that showed up, 0 to the defaulter", () => {
    expect(defaultedSetScore(BVL, 0, "home")).toEqual({ home: 0, away: 25 });
    expect(defaultedSetScore(BVL, 1, "away")).toEqual({ home: 25, away: 0 });
    expect(defaultedSetScore(BO3, 2, "away")).toEqual({ home: 15, away: 0 });
  });

  it("is a valid score, so it completes a game like any other", () => {
    const sets = [defaultedSetScore(BVL, 0, "home"), { home: 25, away: 20 }];
    expect(validateScore(BVL, sets).ok).toBe(true);
  });
});

describe("defaultProblem", () => {
  it("accepts a defaulted set carrying the default score", () => {
    expect(
      defaultProblem(BVL, [
        { home: 0, away: 25, defaultedBy: "home" },
        { home: 25, away: 23 },
      ]),
    ).toBeNull();
  });

  it("refuses a defaulted set with any other score", () => {
    expect(
      defaultProblem(BVL, [{ home: 3, away: 25, defaultedBy: "home" }]),
    ).toBe("Set 1 is marked as a default, so it must be 0–25.");
  });

  it("refuses an unknown side", () => {
    expect(
      defaultProblem(BVL, [
        // @ts-expect-error: a forged request
        { home: 0, away: 25, defaultedBy: "neither" },
      ]),
    ).toBe("Set 1: unknown default.");
  });
});

describe("describeDefaults", () => {
  it("names the team per defaulted set, for the audit", () => {
    expect(
      describeDefaults(
        [
          { home: 25, away: 20 },
          { home: 25, away: 0, defaultedBy: "away" },
        ],
        "Lions",
        "Tigers",
      ),
    ).toEqual(["Set 2: Tigers defaulted"]);
  });
});

describe("both teams default a set (0184)", () => {
  it("is 0–0, nobody wins it, and the other set decides the game", () => {
    const sets = [
      { home: 0, away: 0, defaultedBy: "both" as const },
      { home: 25, away: 20 },
    ];
    expect(defaultedSetScore(BVL, 0, "both")).toEqual({ home: 0, away: 0 });
    expect(defaultProblem(BVL, sets)).toBeNull();
    const v = validateScore(BVL, sets);
    expect(v.ok).toBe(true);
    expect(v.winner).toBe("home");
    expect(allSetsDoubleDefaulted(sets)).toBe(false);
  });

  it("a plain 0–0 is still refused: only a default can be level", () => {
    expect(
      validateScore(BVL, [
        { home: 0, away: 0 },
        { home: 25, away: 20 },
      ]).ok,
    ).toBe(false);
  });

  it("every set defaulted by both teams is a double default", () => {
    const both = { home: 0, away: 0, defaultedBy: "both" as const };
    expect(allSetsDoubleDefaulted([both, both])).toBe(true);
    expect(validateScore(BVL, [both, both]).ok).toBe(true);
  });
});
