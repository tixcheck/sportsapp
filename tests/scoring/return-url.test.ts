import { describe, expect, it } from "vitest";

import { gameAnchor, scorekeeperReturnUrl } from "@/lib/scoring/return-url";

describe("scorekeeperReturnUrl", () => {
  it("returns to the game's night, scrolled to the game", () => {
    expect(
      scorekeeperReturnUrl(
        "c1",
        { id: "m1", scheduledAt: "2026-10-21T23:30:00Z" },
        "America/Toronto",
      ),
    ).toBe("/score/c1?day=2026-10-21#game-m1");
  });

  it("uses the league's local date for a late game past midnight UTC", () => {
    // 9:30 PM Tuesday in Toronto is 01:30 Wednesday UTC.
    expect(
      scorekeeperReturnUrl(
        "c1",
        { id: "m1", scheduledAt: "2026-10-21T01:30:00Z" },
        "America/Toronto",
      ),
    ).toBe("/score/c1?day=2026-10-20#game-m1");
  });

  it("leaves the day off an untimed game", () => {
    expect(
      scorekeeperReturnUrl("c1", { id: "m1", scheduledAt: null }, "UTC"),
    ).toBe("/score/c1#game-m1");
  });

  it("aims at the same id the page gives each game", () => {
    expect(
      scorekeeperReturnUrl("c", { id: "x", scheduledAt: null }, "UTC"),
    ).toContain(`#${gameAnchor("x")}`);
  });
});
