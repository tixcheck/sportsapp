import { describe, expect, it } from "vitest";

import { canClearResult, isFutureMatch } from "@/lib/scoring/lock";

describe("isFutureMatch", () => {
  const tz = "America/Toronto";

  it("locks a game on a later calendar day", () => {
    expect(isFutureMatch("2099-01-01T18:00:00-05:00", tz)).toBe(true);
  });

  it("allows a game in the past", () => {
    expect(isFutureMatch("2020-01-01T18:00:00-05:00", tz)).toBe(false);
  });

  it("does not lock an unscheduled game", () => {
    expect(isFutureMatch(null, tz)).toBe(false);
  });
});

describe("canClearResult", () => {
  it("lets an organizer clear a pool/league match", () => {
    expect(canClearResult({ isAdmin: true, bracketPosition: null })).toEqual({
      ok: true,
    });
  });

  it("refuses a non-organizer", () => {
    const r = canClearResult({ isAdmin: false, bracketPosition: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/organizer/i);
  });

  it("refuses a playoff (bracket) match even for an organizer", () => {
    const r = canClearResult({ isAdmin: true, bracketPosition: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/bracket/i);
  });
});
