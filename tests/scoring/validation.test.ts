import { describe, expect, it } from "vitest";

import {
  canFinalize,
  recordedDecision,
  setTarget,
  validateScore,
  validateSet,
} from "@/lib/scoring/validation";
import type { MatchFormat } from "@/lib/db/schema";

const BO5: MatchFormat = {
  bestOf: 5,
  setsToPoints: [25, 25, 25, 25, 15],
  winBy: 2,
};
const BO3: MatchFormat = { bestOf: 3, setsToPoints: [25, 25, 25], winBy: 2 };
const T21: MatchFormat = { bestOf: 3, setsToPoints: [21, 21, 15], winBy: 2 };
const T15: MatchFormat = { bestOf: 3, setsToPoints: [15, 15, 11], winBy: 2 };
const POOL: MatchFormat = {
  bestOf: 3,
  setsToPoints: [21, 21, 11],
  winBy: 2,
  capMinutes: 45,
};
// A fixed 2-set round-robin game (ties allowed).
const TWO_SET: MatchFormat = { bestOf: 2, setsToPoints: [21, 21], winBy: 2 };

describe("setTarget", () => {
  it("returns the per-set target, deciding set included", () => {
    expect(setTarget(BO5, 0)).toBe(25);
    expect(setTarget(BO5, 4)).toBe(15);
    expect(setTarget(POOL, 2)).toBe(11);
    expect(setTarget(BO5, 9)).toBe(15);
  });
});

describe("validateScore — 2-set games (ties allowed)", () => {
  it("accepts a 2–0", () => {
    const r = validateScore(TWO_SET, [
      { home: 21, away: 15 },
      { home: 21, away: 10 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([]);
    expect(r.winner).toBe("home");
  });

  it("accepts a 1–1 tie as a complete result (winner null)", () => {
    const r = validateScore(TWO_SET, [
      { home: 21, away: 15 },
      { home: 18, away: 21 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([]);
    expect(r.winner).toBeNull();
    expect(r.homeSetsWon).toBe(1);
    expect(r.awaySetsWon).toBe(1);
  });

  it("blocks fewer than 2 sets", () => {
    const r = validateScore(TWO_SET, [{ home: 21, away: 15 }]);
    expect(r.ok).toBe(false);
    expect(r.blocks.length).toBeGreaterThan(0);
  });

  it("blocks more than 2 sets", () => {
    const r = validateScore(TWO_SET, [
      { home: 21, away: 15 },
      { home: 10, away: 21 },
      { home: 15, away: 12 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("still rejects an illegal set (target reached without a 2-point margin)", () => {
    const r = validateScore(TWO_SET, [
      { home: 21, away: 20 },
      { home: 21, away: 10 },
    ]);
    expect(r.blocks.some((b) => /2 points/.test(b))).toBe(true);
  });
});

describe("recordedDecision — 2-set games", () => {
  it("is decided only once both sets are in (a 1–1 is decided)", () => {
    expect(recordedDecision([{ home: 21, away: 15 }], 2).decided).toBe(false);
    expect(
      recordedDecision(
        [
          { home: 21, away: 15 },
          { home: 10, away: 21 },
        ],
        2,
      ).decided,
    ).toBe(true);
  });
});

describe("validateScore — clean complete results", () => {
  it("accepts a clean 3–0 sweep (best of 5)", () => {
    const r = validateScore(BO5, [
      { home: 25, away: 18 },
      { home: 25, away: 20 },
      { home: 25, away: 22 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.winner).toBe("home");
  });

  it("accepts a deuce finish (27–25) with a decided match", () => {
    const r = validateScore(BO3, [
      { home: 27, away: 25 },
      { home: 25, away: 10 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("21–19 and deuce 22–20 / 30–28 are clean (no upper cap)", () => {
    expect(
      validateScore(T21, [
        { home: 21, away: 19 },
        { home: 22, away: 20 },
      ]).ok,
    ).toBe(true);
    expect(
      validateScore(T21, [
        { home: 30, away: 28 },
        { home: 21, away: 19 },
      ]).ok,
    ).toBe(true);
    expect(
      validateScore(T21, [
        { home: 30, away: 28 },
        { home: 21, away: 19 },
      ]).warnings,
    ).toEqual([]);
  });

  it("scales to a to-15 pool: 15–13 and deuce 17–15 are clean", () => {
    expect(
      validateScore(T15, [
        { home: 15, away: 13 },
        { home: 15, away: 11 },
      ]).ok,
    ).toBe(true);
    expect(
      validateScore(T15, [
        { home: 17, away: 15 },
        { home: 15, away: 11 },
      ]).ok,
    ).toBe(true);
  });

  it("completes on 2–1", () => {
    const r = validateScore(T21, [
      { home: 21, away: 18 },
      { home: 15, away: 21 },
      { home: 15, away: 12 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.winner).toBe("home");
  });
});

describe("validateScore — hard errors (always block)", () => {
  it("blocks a tied set", () => {
    const r = validateScore(BO3, [{ home: 25, away: 25 }]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/can't end tied/);
  });
  it("blocks negative / non-integer", () => {
    expect(
      validateScore(BO3, [{ home: -1, away: 25 }]).errors.length,
    ).toBeGreaterThan(0);
    expect(
      validateScore(BO3, [{ home: 25.5, away: 20 }]).errors.length,
    ).toBeGreaterThan(0);
  });
});

describe("validateScore — blocks (default-block, override-able)", () => {
  it("blocks a set reaching target without a 2-point margin (21–20)", () => {
    const r = validateScore(T21, [
      { home: 21, away: 20 },
      { home: 21, away: 19 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.blocks.some((b) => /won by 2 points/.test(b))).toBe(true);
  });
  it("blocks 15–14 in a to-15 pool", () => {
    const r = validateScore(T15, [
      { home: 15, away: 14 },
      { home: 15, away: 11 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.blocks.some((b) => /won by 2 points/.test(b))).toBe(true);
  });
  it("blocks an incomplete match (1 set in a best-of-3) with the best-of reason", () => {
    const r = validateScore(T21, [{ home: 21, away: 19 }]);
    expect(r.ok).toBe(false);
    expect(r.blocks.some((b) => /best of 3/.test(b))).toBe(true);
  });
  it("blocks 1–1 (no majority)", () => {
    const r = validateScore(T21, [
      { home: 21, away: 19 },
      { home: 18, away: 21 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.blocks.some((b) => /best of 3/.test(b))).toBe(true);
  });
});

describe("validateScore — warnings (never block)", () => {
  it("warns on a time-capped below-target set (18–16) but completes", () => {
    const r = validateScore(POOL, [
      { home: 21, away: 15 },
      { home: 18, away: 16 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([]);
    expect(r.warnings.some((w) => /below the target/.test(w))).toBe(true);
  });
  it("warns on an overshoot (30–20) but completes", () => {
    const r = validateScore(BO3, [
      { home: 30, away: 20 },
      { home: 25, away: 10 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /runs past/.test(w))).toBe(true);
  });
});

describe("canFinalize — admin override gating", () => {
  const incomplete = validateScore(T21, [{ home: 21, away: 19 }]); // a block
  const illegal = validateScore(T21, [
    { home: 21, away: 20 },
    { home: 21, away: 19 },
  ]);
  const hard = validateScore(T21, [{ home: 21, away: 21 }]); // tied → error
  const clean = validateScore(T21, [
    { home: 21, away: 19 },
    { home: 21, away: 18 },
  ]);

  it("a captain (not admin) cannot finalize a blocked result", () => {
    expect(canFinalize(incomplete, { isAdmin: false, override: true })).toBe(
      false,
    );
    expect(canFinalize(illegal, { isAdmin: false, override: true })).toBe(
      false,
    );
  });
  it("an admin can override blocks deliberately", () => {
    expect(canFinalize(incomplete, { isAdmin: true, override: true })).toBe(
      true,
    );
    expect(canFinalize(illegal, { isAdmin: true, override: true })).toBe(true);
  });
  it("an admin without the explicit override is still blocked", () => {
    expect(canFinalize(incomplete, { isAdmin: true, override: false })).toBe(
      false,
    );
  });
  it("hard errors never finalize, even an admin override", () => {
    expect(canFinalize(hard, { isAdmin: true, override: true })).toBe(false);
  });
  it("a clean result finalizes for anyone without override", () => {
    expect(canFinalize(clean, { isAdmin: false, override: false })).toBe(true);
  });
});

describe("validateSet — per-set Record", () => {
  it("rejects a target-without-2-point set (21–20) and accepts 21–19 / 22–20", () => {
    expect(validateSet(T21, 0, { home: 21, away: 20 }).status).toBe("reject");
    expect(validateSet(T21, 0, { home: 21, away: 19 }).status).toBe("ok");
    expect(validateSet(T21, 0, { home: 22, away: 20 }).status).toBe("ok");
    expect(validateSet(T21, 0, { home: 30, away: 28 }).status).toBe("ok");
  });
  it("rejects tied / negative", () => {
    expect(validateSet(T21, 0, { home: 21, away: 21 }).status).toBe("reject");
    expect(validateSet(T21, 0, { home: -1, away: 21 }).status).toBe("reject");
  });
  it("warns (accepts) a below-target capped set (18–16)", () => {
    const v = validateSet(POOL, 1, { home: 18, away: 16 });
    expect(v.status).toBe("warn");
  });
  it("scales to a to-15 pool: 15–14 reject, 15–13 / 17–15 ok", () => {
    expect(validateSet(T15, 0, { home: 15, away: 14 }).status).toBe("reject");
    expect(validateSet(T15, 0, { home: 15, away: 13 }).status).toBe("ok");
    expect(validateSet(T15, 0, { home: 17, away: 15 }).status).toBe("ok");
  });
});

describe("recordedDecision — reactive submit/grey-out source", () => {
  it("undecided until a majority of recorded sets", () => {
    expect(recordedDecision([{ home: 21, away: 10 }], 3).decided).toBe(false);
  });
  it("2–0 in a best-of-3 is decided", () => {
    const d = recordedDecision(
      [
        { home: 21, away: 10 },
        { home: 21, away: 12 },
      ],
      3,
    );
    expect(d.decided).toBe(true);
    expect(d.homeSetsWon).toBe(2);
  });
  it("re-deriving after an edit to 1–1 is no longer decided (no latch)", () => {
    // set 1 edited from a home win to a loss → 1–1
    const d = recordedDecision(
      [
        { home: 10, away: 21 },
        { home: 21, away: 12 },
      ],
      3,
    );
    expect(d.decided).toBe(false);
  });
  it("3 of 5 decides a best-of-5", () => {
    expect(
      recordedDecision(
        [
          { home: 25, away: 10 },
          { home: 10, away: 25 },
          { home: 25, away: 10 },
          { home: 25, away: 10 },
        ],
        5,
      ).decided,
    ).toBe(true);
  });
});
