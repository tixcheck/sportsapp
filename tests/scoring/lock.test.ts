import { describe, expect, it } from "vitest";

import { isFutureMatch } from "@/lib/scoring/lock";

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
