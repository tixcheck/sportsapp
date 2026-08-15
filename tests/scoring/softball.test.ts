import { describe, expect, it } from "vitest";

import type { MatchFormat } from "@/lib/db/schema";
import { validateScore, validateSet } from "@/lib/scoring/validation";
import { formatCourtLabel } from "@/lib/scheduler/court-label";
import { sportConfig } from "@/lib/sports";

/** Regular season: seven innings or a clock, a level score is a result. */
const SEASON: MatchFormat = {
  bestOf: 1,
  setsToPoints: [0],
  winBy: 1,
  untargeted: true,
  allowTie: true,
};

/** Playoffs: the same game, but it has to produce a winner. */
const PLAYOFF: MatchFormat = { ...SEASON, allowTie: false };

/** A volleyball format, to prove none of this leaked sideways. */
const VOLLEY: MatchFormat = { bestOf: 2, setsToPoints: [25, 25], winBy: 2 };

describe("a softball regular-season game", () => {
  it("records an ordinary result", () => {
    const v = validateScore(SEASON, [{ home: 7, away: 4 }]);
    expect(v.ok).toBe(true);
    expect(v.winner).toBe("home");
  });

  it("accepts a one-run game without demanding a two-run margin", () => {
    const v = validateScore(SEASON, [{ home: 5, away: 4 }]);
    expect(v.ok).toBe(true);
    expect(v.blocks).toEqual([]);
  });

  it("accepts a tie as a complete result", () => {
    const v = validateScore(SEASON, [{ home: 6, away: 6 }]);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.blocks).toEqual([]);
    expect(v.winner).toBeNull();
  });

  it("does not warn about a blowout", () => {
    // The whole point of `untargeted`: there is no target to run past, so a
    // 15-0 game is just a 15-0 game.
    const v = validateScore(SEASON, [{ home: 15, away: 0 }]);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  it("accepts a scoreless tie", () => {
    const v = validateScore(SEASON, [{ home: 0, away: 0 }]);
    expect(v.ok).toBe(true);
  });

  it("still rejects impossible data", () => {
    expect(validateScore(SEASON, [{ home: -1, away: 3 }]).errors).not.toEqual(
      [],
    );
    expect(validateScore(SEASON, [{ home: 2.5, away: 3 }]).errors).not.toEqual(
      [],
    );
  });
});

describe("a softball playoff game", () => {
  it("refuses a tie — it goes to extra innings", () => {
    const v = validateScore(PLAYOFF, [{ home: 6, away: 6 }]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/tied/i);
  });

  it("takes the result once extra innings settle it", () => {
    const v = validateScore(PLAYOFF, [{ home: 8, away: 7 }]);
    expect(v.ok).toBe(true);
    expect(v.winner).toBe("home");
  });
});

describe("validateSet, per game", () => {
  it("allows a level score only when the format does", () => {
    expect(validateSet(SEASON, 0, { home: 3, away: 3 }).status).toBe("ok");
    expect(validateSet(PLAYOFF, 0, { home: 3, away: 3 }).status).toBe("reject");
  });

  it("never warns about the score being short or long", () => {
    expect(validateSet(SEASON, 0, { home: 1, away: 0 }).status).toBe("ok");
    expect(validateSet(SEASON, 0, { home: 22, away: 1 }).status).toBe("ok");
  });
});

describe("volleyball is untouched", () => {
  it("still refuses a tied set", () => {
    const v = validateScore(VOLLEY, [
      { home: 25, away: 25 },
      { home: 25, away: 20 },
    ]);
    expect(v.errors.join(" ")).toMatch(/tied/i);
  });

  it("still enforces win-by-two", () => {
    const v = validateScore(VOLLEY, [
      { home: 25, away: 24 },
      { home: 25, away: 20 },
    ]);
    expect(v.blocks.join(" ")).toMatch(/won by 2/i);
  });

  it("still warns when a set falls short of target", () => {
    const v = validateScore(VOLLEY, [
      { home: 18, away: 16 },
      { home: 25, away: 20 },
    ]);
    expect(v.warnings.join(" ")).toMatch(/below the target/i);
  });

  it("still treats a 1-1 two-set game as a valid tie", () => {
    const v = validateScore(VOLLEY, [
      { home: 25, away: 20 },
      { home: 20, away: 25 },
    ]);
    expect(v.ok).toBe(true);
    expect(v.winner).toBeNull();
  });
});

describe("sport vocabulary", () => {
  it("calls a softball surface a Field and a volleyball one a Court", () => {
    expect(formatCourtLabel("East", "softball")).toBe("Field East");
    expect(formatCourtLabel("3", "indoor6")).toBe("Court 3");
    // No sport given still means volleyball, so nothing existing moves.
    expect(formatCourtLabel("3")).toBe("Court 3");
  });

  it("does not double a label that already names itself", () => {
    expect(formatCourtLabel("Field West", "softball")).toBe("Field West");
    expect(formatCourtLabel("Court A", "indoor6")).toBe("Court A");
    // Cross-sport: a label stored with the other sport's word is still read.
    expect(formatCourtLabel("Court A", "softball")).toBe("Field A");
  });

  it("returns null for a missing label", () => {
    expect(formatCourtLabel(null, "softball")).toBeNull();
    expect(formatCourtLabel("  ", "softball")).toBeNull();
    expect(formatCourtLabel("Field", "softball")).toBeNull();
  });

  it("knows softball has no scored periods, so standings hide sets", () => {
    expect(sportConfig("softball").hasPeriods).toBe(false);
    expect(sportConfig("indoor6").hasPeriods).toBe(true);
  });

  it("names the officials and the points columns per sport", () => {
    expect(sportConfig("softball").official.one).toBe("Umpire");
    expect(sportConfig("softball").points.short).toEqual(["RF", "RA"]);
    expect(sportConfig("beach2").points.short).toEqual(["PF", "PA"]);
  });
});
