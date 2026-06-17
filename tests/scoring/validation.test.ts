import { describe, expect, it } from "vitest";

import { setTarget, validateScore } from "@/lib/scoring/validation";
import type { MatchFormat } from "@/lib/db/schema";

const BO5: MatchFormat = {
  bestOf: 5,
  setsToPoints: [25, 25, 25, 25, 15],
  winBy: 2,
};
const BO3: MatchFormat = { bestOf: 3, setsToPoints: [25, 25, 25], winBy: 2 };
const POOL: MatchFormat = {
  bestOf: 3,
  setsToPoints: [21, 21, 11],
  winBy: 2,
  capMinutes: 45,
};

describe("setTarget", () => {
  it("returns the per-set target, deciding set included", () => {
    expect(setTarget(BO5, 0)).toBe(25);
    expect(setTarget(BO5, 4)).toBe(15);
    expect(setTarget(POOL, 2)).toBe(11); // beach pool tiebreak
    expect(setTarget(BO5, 9)).toBe(15); // past the end → last target
  });
});

describe("validateScore — clean results", () => {
  it("accepts a clean 3–0 sweep with no warnings", () => {
    const r = validateScore(BO5, [
      { home: 25, away: 18 },
      { home: 25, away: 20 },
      { home: 25, away: 22 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.homeSetsWon).toBe(3);
    expect(r.winner).toBe("home");
  });

  it("accepts a deuce finish (27–25) without warning", () => {
    const r = validateScore(BO3, [
      { home: 27, away: 25 },
      { home: 25, away: 10 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.winner).toBe("home");
  });
});

describe("validateScore — hard blocks (impossible data)", () => {
  it("blocks a tied set (no winner)", () => {
    const r = validateScore(BO3, [{ home: 25, away: 25 }]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/can't end tied/);
  });

  it("blocks negative or non-integer scores", () => {
    expect(validateScore(BO3, [{ home: -1, away: 25 }]).ok).toBe(false);
    expect(validateScore(BO3, [{ home: 25.5, away: 20 }]).ok).toBe(false);
  });
});

describe("validateScore — warns but allows (capped / unusual)", () => {
  it("warns on a below-target capped set (18–16) but allows it", () => {
    const r = validateScore(POOL, [
      { home: 21, away: 15 },
      { home: 18, away: 16 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /below the target/.test(w))).toBe(true);
    expect(r.winner).toBe("home");
  });

  it("warns on a win-by-1 (25–24)", () => {
    const r = validateScore(BO3, [{ home: 25, away: 24 }]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /less than win-by-2/.test(w))).toBe(true);
  });

  it("warns on an overshoot (30–20)", () => {
    const r = validateScore(BO3, [{ home: 30, away: 20 }]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /runs past/.test(w))).toBe(true);
  });

  it("warns when the match isn't decided", () => {
    const r = validateScore(BO3, [{ home: 25, away: 20 }]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /not decided/.test(w))).toBe(true);
  });

  it("warns when sets are tied (no match winner)", () => {
    const r = validateScore(BO3, [
      { home: 25, away: 20 },
      { home: 18, away: 25 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.winner).toBeNull();
    expect(r.warnings.some((w) => /tied/.test(w))).toBe(true);
  });

  it("warns when more sets than the best-of are entered", () => {
    const r = validateScore(BO3, [
      { home: 25, away: 20 },
      { home: 20, away: 25 },
      { home: 25, away: 20 },
      { home: 25, away: 20 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /best-of-3/.test(w))).toBe(true);
  });
});
